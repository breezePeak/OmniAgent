import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const output = join(process.cwd(), 'apps', 'extension', '.output', 'chrome-mv3');
const requiredFiles = [
  'manifest.json',
  'background.js',
  'sidepanel.html',
  'content-scripts/content.js',
  'content-scripts/deepseek-main.js',
  'content-scripts/kimi.js',
  'content-scripts/kimi-main.js',
];

for (const relativePath of requiredFiles) {
  const path = join(output, relativePath);
  const size = statSync(path).size;
  if (size === 0) throw new Error(`Build artifact is empty: ${relativePath}`);
}

const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
assert(manifest.manifest_version === 3, 'Expected a Manifest V3 extension');
assert(manifest.background?.service_worker === 'background.js', 'Background service worker is missing');
assert(manifest.side_panel?.default_path === 'sidepanel.html', 'Side panel entry is missing');

const contentScripts = manifest.content_scripts ?? [];
assert(contentScripts.some((entry) => entry.matches?.includes('*://chat.deepseek.com/*')), 'DeepSeek content script is missing');
const browserAgent = contentScripts.find((entry) => entry.matches?.includes('*://*/*'));
assert(browserAgent, 'Browser Agent content script is missing');
for (const excludedMatch of [
  '*://chat.deepseek.com/*',
  '*://kimi.com/*',
  '*://www.kimi.com/*',
  '*://kimi.moonshot.cn/*',
  '*://www.kimi.moonshot.cn/*',
]) {
  assert(browserAgent.exclude_matches?.includes(excludedMatch), `Browser Agent must not race the provider content script: ${excludedMatch}`);
}
for (const match of [
  '*://kimi.com/*',
  '*://www.kimi.com/*',
  '*://kimi.moonshot.cn/*',
  '*://www.kimi.moonshot.cn/*',
]) {
  assert(contentScripts.some((entry) => entry.matches?.includes(match)), `Kimi content script is missing: ${match}`);
}

const background = readFileSync(join(output, 'background.js'), 'utf8');
for (const marker of ['explicit-memory-saved-locally', 'memory.save_batch', 'omni:render-tool-status']) {
  assert(background.includes(marker), `Background release marker is missing: ${marker}`);
}

for (const relativePath of ['content-scripts/content.js', 'content-scripts/kimi.js']) {
  const content = readFileSync(join(output, relativePath), 'utf8');
  assert(content.includes('omni:render-tool-status'), `Visible tool status support is missing from ${relativePath}`);
}

const totalBytes = requiredFiles.reduce((total, relativePath) => total + statSync(join(output, relativePath)).size, 0);
console.log(JSON.stringify({ ok: true, manifestVersion: manifest.manifest_version, files: requiredFiles.length, totalBytes }));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
