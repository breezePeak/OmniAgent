import { BrowserPageController } from '@omni-agent/browser-agent';
import type { ExtensionMessage, ExtensionMessageMap } from '@omni-agent/shared';

const browserCommandTypes = [
  'omni:browser-snapshot',
  'omni:browser-click',
  'omni:browser-type',
  'omni:browser-scroll',
] as const;

type BrowserPageCommandType = typeof browserCommandTypes[number];

export function isBrowserPageCommand(
  message: ExtensionMessage,
): message is ExtensionMessage<BrowserPageCommandType> {
  return browserCommandTypes.includes(message.type as BrowserPageCommandType);
}

export function handleBrowserPageCommand(
  message: ExtensionMessage<BrowserPageCommandType>,
  controller: BrowserPageController,
): unknown {
  if (message.type === 'omni:browser-snapshot') {
    const payload = message.payload as ExtensionMessageMap['omni:browser-snapshot'] | undefined;
    return controller.snapshot(payload);
  }
  if (message.type === 'omni:browser-click') {
    const payload = message.payload as ExtensionMessageMap['omni:browser-click'] | undefined;
    return controller.click(payload ?? {});
  }
  if (message.type === 'omni:browser-type') {
    const payload = message.payload as ExtensionMessageMap['omni:browser-type'] | undefined;
    if (!payload) throw new Error('browser.type payload is required');
    return controller.type(payload);
  }
  const payload = message.payload as ExtensionMessageMap['omni:browser-scroll'] | undefined;
  return controller.scroll(payload ?? {});
}
