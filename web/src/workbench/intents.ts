export type ClickIntent =
  | { type: 'command'; commandId: string }
  | { type: 'select-workspace'; workspaceId: string }
  | { type: 'select-tab'; tabId: string }
  | { type: 'rename-tab'; tabId: string }
  | { type: 'close-tab'; tabId: string }
  | { type: 'select-pane'; paneId: string }
  | { type: 'rename-pane'; paneId: string }
  | { type: 'show-pane-info'; paneId: string }
  | { type: 'close-pane'; paneId: string }
  | { type: 'split-pane'; paneId: string; axis: 'row' | 'column' }
  | {
      type: 'action';
      action:
        | 'new-workspace'
        | 'new-tab'
        | 'rename-workspace'
        | 'close-workspace'
        | 'toggle-sidebar'
        | 'open-appearance'
        | 'open-palette'
        | 'dialog-cancel'
        | 'dialog-submit';
    };

export type DoubleClickIntent =
  | { type: 'rename-tab'; tabId: string }
  | { type: 'rename-pane'; paneId: string }
  | { type: 'rename-workspace'; workspaceId: string };

export type KeyboardIntent =
  | { type: 'close-dialog' }
  | { type: 'submit-dialog' }
  | { type: 'move-palette-selection'; delta: number }
  | { type: 'run-selected-palette-command' }
  | { type: 'open-palette' }
  | { type: 'new-tab' }
  | { type: 'toggle-sidebar' }
  | { type: 'split-active-pane'; axis: 'row' | 'column'; placement: 'after' }
  | { type: 'close-tab' }
  | { type: 'close-active-pane' }
  | { type: 'previous-tab' }
  | { type: 'next-tab' }
  | { type: 'select-workspace-index'; index: number };

export type KeyboardIntentOptions = {
  dialogMode: 'none' | 'palette' | 'dialog';
  isEditable: boolean;
  isOverlayInput: boolean;
};

export function resolveClickIntent(target: HTMLElement | null): ClickIntent | null {
  if (!target) return null;

  if (target.classList.contains('overlay-scrim') && !target.closest('.overlay-panel')) {
    return { type: 'action', action: 'dialog-cancel' };
  }

  const button = target.closest<HTMLElement>(
    '[data-action], [data-workspace-id], [data-tab-id], [data-pane-id], [data-command-id]',
  );
  if (!button) return null;

  const workspaceId = button.dataset.workspaceId;
  const tabId = button.dataset.tabId;
  const paneId = button.dataset.paneId;
  const commandId = button.dataset.commandId;
  const action = button.dataset.action;

  if (commandId) {
    return { type: 'command', commandId };
  }

  if (workspaceId) {
    return { type: 'select-workspace', workspaceId };
  }

  if (tabId) {
    switch (action) {
      case 'rename-tab-request':
        return { type: 'rename-tab', tabId };
      case 'close-tab-request':
        return { type: 'close-tab', tabId };
      default:
        return { type: 'select-tab', tabId };
    }
  }

  if (paneId) {
    switch (action) {
      case 'rename-pane-request':
        return { type: 'rename-pane', paneId };
      case 'show-pane-info':
        return { type: 'show-pane-info', paneId };
      case 'close-pane':
        return { type: 'close-pane', paneId };
      case 'split-right':
        return { type: 'split-pane', paneId, axis: 'row' };
      case 'split-down':
        return { type: 'split-pane', paneId, axis: 'column' };
      default:
        return { type: 'select-pane', paneId };
    }
  }

  switch (action) {
    case 'new-workspace':
    case 'new-tab':
    case 'rename-workspace':
    case 'close-workspace':
    case 'toggle-sidebar':
    case 'open-appearance':
    case 'open-palette':
    case 'dialog-cancel':
    case 'dialog-submit':
      return { type: 'action', action };
    default:
      return null;
  }
}

export function resolveDoubleClickIntent(target: HTMLElement | null): DoubleClickIntent | null {
  if (!target) return null;

  const tabButton = target.closest<HTMLElement>('[data-tab-id]');
  if (tabButton?.dataset.tabId) {
    return { type: 'rename-tab', tabId: tabButton.dataset.tabId };
  }

  const paneButton = target.closest<HTMLElement>('.pane-heading');
  if (paneButton?.dataset.paneId) {
    return { type: 'rename-pane', paneId: paneButton.dataset.paneId };
  }

  const workspaceButton = target.closest<HTMLElement>('[data-workspace-id]');
  if (workspaceButton?.dataset.workspaceId) {
    return { type: 'rename-workspace', workspaceId: workspaceButton.dataset.workspaceId };
  }

  return null;
}

export function resolveKeyboardIntent(
  event: KeyboardEvent,
  options: KeyboardIntentOptions,
): KeyboardIntent | null {
  const { dialogMode, isEditable, isOverlayInput } = options;

  if (dialogMode === 'palette') {
    if (event.key === 'Escape') return { type: 'close-dialog' };
    if (event.key === 'ArrowDown') return { type: 'move-palette-selection', delta: 1 };
    if (event.key === 'ArrowUp') return { type: 'move-palette-selection', delta: -1 };
    if (event.key === 'Enter') return { type: 'run-selected-palette-command' };
  } else if (dialogMode === 'dialog') {
    if (event.key === 'Escape') return { type: 'close-dialog' };
    if (event.key === 'Enter') return { type: 'submit-dialog' };
  }

  const lowerKey = event.key.toLowerCase();
  const browserSafeShiftAlt = event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey;
  const browserSafeCtrlShift = event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey;
  const browserSafeAlt = event.altKey && !event.shiftKey && !event.metaKey && !event.ctrlKey;

  if (
    (event.metaKey && (lowerKey === 'p' || lowerKey === 'k')) ||
    (browserSafeCtrlShift && lowerKey === 'p')
  ) {
    return { type: 'open-palette' };
  }

  if (isEditable && isOverlayInput) return null;

  if ((event.metaKey && lowerKey === 't') || (browserSafeShiftAlt && lowerKey === 't')) {
    return { type: 'new-tab' };
  }

  if ((event.metaKey && lowerKey === 'b') || (browserSafeShiftAlt && lowerKey === 'b')) {
    return { type: 'toggle-sidebar' };
  }

  if (
    (event.metaKey && lowerKey === 'd') ||
    (browserSafeShiftAlt && lowerKey === 'l') ||
    (browserSafeShiftAlt && lowerKey === 'j')
  ) {
    return {
      type: 'split-active-pane',
      axis: (event.metaKey && event.shiftKey) || (browserSafeShiftAlt && lowerKey === 'j')
        ? 'column'
        : 'row',
      placement: 'after',
    };
  }

  if ((event.metaKey && event.altKey && lowerKey === 'w') || (browserSafeShiftAlt && lowerKey === 'x')) {
    return { type: 'close-tab' };
  }

  if ((event.metaKey && lowerKey === 'w') || (browserSafeShiftAlt && lowerKey === 'w')) {
    return { type: 'close-active-pane' };
  }

  if (event.metaKey && event.shiftKey && event.key === '[') {
    return { type: 'previous-tab' };
  }

  if (event.metaKey && event.shiftKey && event.key === ']') {
    return { type: 'next-tab' };
  }

  if ((event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) || browserSafeAlt) {
    const digit = /^[0-9]$/.test(event.key)
      ? event.key
      : event.code.startsWith('Digit')
        ? event.code.slice('Digit'.length)
        : null;
    if (digit) {
      return {
        type: 'select-workspace-index',
        index: digit === '0' ? 9 : Number(digit) - 1,
      };
    }
  }

  return null;
}
