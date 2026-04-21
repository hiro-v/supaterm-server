import { describe, expect, test } from 'bun:test';
import { ensureDom } from '../helpers/dom';
import {
  resolveClickIntent,
  resolveDoubleClickIntent,
  resolveKeyboardIntent,
} from '../../web/src/workbench/intents';
import { mountWorkbenchView } from '../../web/src/workbench/view';

describe('workbench intents', () => {
  test('resolves click intents from sidebar and pane chrome controls', () => {
    ensureDom();
    const root = document.createElement('div');
    document.body.append(root);
    const view = mountWorkbenchView(root);
    view.sidebarTabs.innerHTML = `
      <div data-tab-id="tab.1">
        <button data-action="rename-tab-request" data-tab-id="tab.1">rename</button>
      </div>
      <div class="pane-heading" data-pane-id="pane.1">
        <button data-action="split-right" data-pane-id="pane.1">split</button>
      </div>
    `;

    expect(resolveClickIntent(view.workspaceDock)).toBeNull();
    expect(resolveClickIntent(view.sidebarTabs.querySelector('[data-action="rename-tab-request"]'))).toEqual({
      type: 'rename-tab',
      tabId: 'tab.1',
    });
    expect(resolveClickIntent(view.sidebarTabs.querySelector('[data-action="split-right"]'))).toEqual({
      type: 'split-pane',
      paneId: 'pane.1',
      axis: 'row',
    });
  });

  test('resolves double click intents from tab, pane, and workspace targets', () => {
    ensureDom();
    const host = document.createElement('div');
    host.innerHTML = `
      <div data-tab-id="tab.1"></div>
      <div class="pane-heading" data-pane-id="pane.1"></div>
      <button data-workspace-id="ws.1"></button>
    `;

    expect(resolveDoubleClickIntent(host.querySelector('[data-tab-id]'))).toEqual({
      type: 'rename-tab',
      tabId: 'tab.1',
    });
    expect(resolveDoubleClickIntent(host.querySelector('.pane-heading'))).toEqual({
      type: 'rename-pane',
      paneId: 'pane.1',
    });
    expect(resolveDoubleClickIntent(host.querySelector('[data-workspace-id]'))).toEqual({
      type: 'rename-workspace',
      workspaceId: 'ws.1',
    });
  });

  test('resolves keyboard intents without leaking DOM specifics into the workbench controller', () => {
    ensureDom();
    const openPaletteEvent = new KeyboardEvent('keydown', { metaKey: true, key: 'p' });
    const splitDownEvent = new KeyboardEvent('keydown', { altKey: true, shiftKey: true, key: 'j' });
    const digitEvent = new KeyboardEvent('keydown', { altKey: true, key: '3' });

    expect(resolveKeyboardIntent(openPaletteEvent, {
      dialogMode: 'none',
      isEditable: false,
      isOverlayInput: false,
    })).toEqual({ type: 'open-palette' });

    expect(resolveKeyboardIntent(splitDownEvent, {
      dialogMode: 'none',
      isEditable: false,
      isOverlayInput: false,
    })).toEqual({ type: 'split-active-pane', axis: 'column', placement: 'after' });

    expect(resolveKeyboardIntent(digitEvent, {
      dialogMode: 'none',
      isEditable: false,
      isOverlayInput: false,
    })).toEqual({ type: 'select-workspace-index', index: 2 });
  });
});

