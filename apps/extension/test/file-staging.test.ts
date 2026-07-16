import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryFilesFromEvent } from '../src/content/file-staging.js';

function file(name: string): File {
  return {
    name,
    size: 4,
    type: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
    lastModified: 1,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  } as File;
}

test('collects an attachment from a file input without relying on DOM instanceof checks', () => {
  const document = file('notes.docx');
  assert.deepEqual(memoryFilesFromEvent({
    target: { type: 'FILE', files: { 0: document, length: 1 } },
  }), [document]);
});

test('collects files from drag/drop and clipboard transfer items', () => {
  const dropped = file('exam.pdf');
  const pasted = file('answers.txt');
  assert.deepEqual(memoryFilesFromEvent({
    dataTransfer: { files: { 0: dropped, length: 1 } },
    clipboardData: { items: { 0: { kind: 'file', getAsFile: () => pasted }, length: 1 } },
  }), [dropped, pasted]);
});

test('deduplicates the same file exposed through transfer files and items', () => {
  const document = file('same.pdf');
  assert.deepEqual(memoryFilesFromEvent({
    dataTransfer: {
      files: { 0: document, length: 1 },
      items: { 0: { kind: 'file', getAsFile: () => document }, length: 1 },
    },
  }), [document]);
});
