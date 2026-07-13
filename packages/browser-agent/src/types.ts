export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  selectedText: string;
  at: number;
}

export interface BrowserActionResult {
  ok: true;
  action: string;
  detail: string;
  url: string;
  title: string;
}

export interface SnapshotOptions {
  includeText?: boolean;
  maxLength?: number;
}

export interface ClickOptions {
  selector?: string;
  text?: string;
  exact?: boolean;
}

export interface TypeOptions {
  selector?: string;
  text?: string;
  value: string;
  clear?: boolean;
  submit?: boolean;
}

export interface ScrollOptions {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  selector?: string;
}

export interface NavigateOptions {
  url: string;
}

export interface BrowserAgentService {
  snapshot(options?: SnapshotOptions): Promise<BrowserSnapshot>;
  click(options: ClickOptions): Promise<BrowserActionResult>;
  type(options: TypeOptions): Promise<BrowserActionResult>;
  scroll(options?: ScrollOptions): Promise<BrowserActionResult>;
  navigate(options: NavigateOptions): Promise<BrowserActionResult>;
}
