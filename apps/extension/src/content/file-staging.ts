import type { ExtensionMessage, SupportedProvider } from '@omni-agent/shared';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['docx', 'pdf', 'txt']);
const pendingStages = new Set<Promise<void>>();
const pendingScans = new Set<() => void>();

type FileTransferLike = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind?: string; getAsFile?: () => File | null }> | null;
};

type FileEventLike = {
  target?: unknown;
  dataTransfer?: FileTransferLike | null;
  clipboardData?: FileTransferLike | null;
};

export async function waitForPendingMemoryFileStaging(): Promise<void> {
  for (const scan of pendingScans) scan();
  while (pendingStages.size) await Promise.allSettled([...pendingStages]);
}

/** Collects attachments from file inputs, drag/drop, and clipboard events. */
export function memoryFilesFromEvent(event: FileEventLike): File[] {
  const target = event.target as { type?: unknown; files?: ArrayLike<File> | null } | null;
  const inputFiles = target && String(target.type).toLocaleLowerCase() === 'file' ? target.files : null;
  return uniqueFiles([
    ...filesFromList(inputFiles),
    ...filesFromTransfer(event.dataTransfer),
    ...filesFromTransfer(event.clipboardData),
  ]);
}

export function installMemoryFileStaging(
  provider: SupportedProvider,
  pageSessionId: string,
  getConversationId: () => string | null,
): () => void {
  const roots = new Set<Document | ShadowRoot>();
  const observers = new Map<Document | ShadowRoot, MutationObserver>();
  const activeFiles = new WeakSet<File>();
  const completedFiles = new WeakSet<File>();

  const onFileEvent = (event: Event) => {
    for (const file of memoryFilesFromEvent(event as Event & FileEventLike)) queueFile(file);
  };

  const scanCurrentInputs = () => {
    // Some component libraries attach an open shadow root after the host was
    // inserted, which does not produce another document mutation.
    for (const element of document.querySelectorAll('*')) {
      if (element.shadowRoot) observeRoot(element.shadowRoot);
    }
    for (const root of roots) {
      for (const input of root.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
        for (const file of filesFromList(input.files)) queueFile(file);
      }
    }
  };

  const inspectNode = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.shadowRoot) observeRoot(node.shadowRoot);
    for (const element of node.querySelectorAll('*')) {
      if (element.shadowRoot) observeRoot(element.shadowRoot);
    }
  };

  const observeRoot = (root: Document | ShadowRoot) => {
    if (roots.has(root)) return;
    roots.add(root);
    root.addEventListener('input', onFileEvent, true);
    root.addEventListener('change', onFileEvent, true);
    root.addEventListener('drop', onFileEvent, true);
    root.addEventListener('paste', onFileEvent, true);
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) inspectNode(node);
    });
    observer.observe(root, { childList: true, subtree: true });
    observers.set(root, observer);
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) observeRoot(element.shadowRoot);
    }
  };

  observeRoot(document);
  pendingScans.add(scanCurrentInputs);

  async function stageFile(file: File): Promise<void> {
    const extension = file.name.split('.').pop()?.toLocaleLowerCase() ?? '';
    if (!SUPPORTED_EXTENSIONS.has(extension) || file.size > MAX_FILE_SIZE) {
      await browser.runtime.sendMessage({
        type: 'omni:memory-diagnostic',
        payload: {
          stage: 'artifact-rejected',
          detail: !SUPPORTED_EXTENSIONS.has(extension) ? '仅支持 DOCX、PDF 和 TXT 文件' : '文件不能超过 20 MB',
          count: 0,
        },
      }).catch(() => undefined);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentHash = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
      const result = await browser.runtime.sendMessage<ExtensionMessage<'omni:stage-memory-artifact'>>({
        type: 'omni:stage-memory-artifact',
        payload: {
          provider,
          pageSessionId,
          conversationId: getConversationId(),
          fileName: file.name,
          mimeType: file.type || mimeFromExtension(extension),
          size: file.size,
          contentHash,
          dataBase64: bytesToBase64(bytes),
        },
      }) as { status?: 'staged' | 'imported' | 'failed'; duplicate?: boolean } | undefined;
      // Imported files already have an exact saved/rejected count from the
      // background importer. Keep that diagnostic instead of overwriting it.
      if (result?.status !== 'imported') {
        await sendDiagnostic('artifact-staged', `${file.name} 已暂存，等待明确的保存指令`, 0);
      }
    } catch (error) {
      console.warn('[OmniAgent] failed to stage attachment for memory', error);
      await sendDiagnostic(
        'artifact-stage-error',
        `${file.name} 暂存失败：${error instanceof Error ? error.message : String(error)}`,
        0,
      );
      throw error;
    }
  }

  function queueFile(file: File): void {
    if (activeFiles.has(file) || completedFiles.has(file)) return;
    activeFiles.add(file);
    const task = stageFile(file)
      .then(() => { completedFiles.add(file); })
      .catch(() => undefined)
      .finally(() => {
        activeFiles.delete(file);
        pendingStages.delete(task);
      });
    pendingStages.add(task);
  }

  return () => {
    pendingScans.delete(scanCurrentInputs);
    for (const root of roots) {
      root.removeEventListener('input', onFileEvent, true);
      root.removeEventListener('change', onFileEvent, true);
      root.removeEventListener('drop', onFileEvent, true);
      root.removeEventListener('paste', onFileEvent, true);
    }
    for (const observer of observers.values()) observer.disconnect();
    roots.clear();
    observers.clear();
  };

  async function sendDiagnostic(stage: string, detail: string, count: number): Promise<void> {
    await browser.runtime.sendMessage({
      type: 'omni:memory-diagnostic',
      payload: { stage, detail, count },
    }).catch(() => undefined);
  }
}

function filesFromTransfer(transfer: FileTransferLike | null | undefined): File[] {
  if (!transfer) return [];
  const files = filesFromList(transfer.files);
  for (const item of arrayFrom(transfer.items)) {
    if (item?.kind && item.kind !== 'file') continue;
    const file = item?.getAsFile?.();
    if (isFileLike(file)) files.push(file);
  }
  return uniqueFiles(files);
}

function filesFromList(list: ArrayLike<File> | null | undefined): File[] {
  return arrayFrom(list).filter(isFileLike);
}

function arrayFrom<T>(value: ArrayLike<T> | null | undefined): T[] {
  if (!value) return [];
  return Array.from({ length: value.length }, (_, index) => value[index]).filter((item): item is T => item !== undefined);
}

function isFileLike(value: unknown): value is File {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<File>;
  return typeof file.name === 'string'
    && typeof file.size === 'number'
    && typeof file.arrayBuffer === 'function';
}

function uniqueFiles(files: File[]): File[] {
  const seen = new Set<File>();
  return files.filter((file) => {
    if (seen.has(file)) return false;
    seen.add(file);
    return true;
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const blockSize = 0x8000;
  for (let index = 0; index < bytes.length; index += blockSize) {
    parts.push(String.fromCharCode(...bytes.subarray(index, index + blockSize)));
  }
  return btoa(parts.join(''));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function mimeFromExtension(extension: string): string {
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === 'pdf') return 'application/pdf';
  return 'text/plain';
}
