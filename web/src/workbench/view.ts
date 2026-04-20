import { iconMarkup } from './shared';

export type WorkbenchView = {
  shell: HTMLDivElement;
  sidebarTabs: HTMLDivElement;
  workspaceDock: HTMLDivElement;
  workspaceTitle: HTMLSpanElement;
  headerTitle: HTMLHeadingElement;
  headerStatus: HTMLSpanElement;
  paneStage: HTMLDivElement;
  footerStatus: HTMLDivElement;
  overlayRoot: HTMLDivElement;
};

export function mountWorkbenchView(root: HTMLDivElement): WorkbenchView {
  root.innerHTML = `
    <div class="workbench-app">
      <div class="workbench-shell" data-role="workbench-shell">
        <aside class="sidebar-shell">
          <div class="sidebar-brand">
            <div class="sidebar-brand-row">
              <div class="brand-mark">supaterm</div>
            </div>
            <div class="workspace-chip">
              <span class="workspace-chip-dot"></span>
              <span class="workspace-chip-title" data-role="workspace-title"></span>
              <span class="workspace-chip-actions">
                <button data-action="rename-workspace" class="icon-button inline-icon" aria-label="Rename active space" title="Rename space">${iconMarkup('rename')}</button>
                <button data-action="close-workspace" class="icon-button inline-icon danger" aria-label="Delete active space" title="Delete space">${iconMarkup('close')}</button>
              </span>
            </div>
          </div>
          <section class="sidebar-tabs-section">
            <div class="sidebar-section-row">
              <div class="sidebar-section-label">Tabs</div>
            </div>
            <div class="sidebar-tabs" data-role="sidebar-tabs"></div>
          </section>
          <button data-action="new-tab" class="sidebar-new-tab" aria-label="New Tab">
            <span class="sidebar-new-tab-plus">+</span>
            <span>New Tab</span>
          </button>
          <div class="space-dock">
            <div class="space-dock-list" data-role="workspace-dock"></div>
            <button data-action="new-workspace" class="space-dock-add" aria-label="Add space">+</button>
          </div>
        </aside>
        <main class="workbench-main">
          <header class="workbench-header">
            <div class="window-title">
              <button data-action="toggle-sidebar" class="icon-button inline-icon" aria-label="Toggle sidebar" title="Toggle sidebar">${iconMarkup('sidebar')}</button>
              <h2 data-role="header-title"></h2>
            </div>
            <div class="header-toolbar">
              <div class="window-status" data-role="header-status"></div>
              <button data-action="open-palette" class="icon-button inline-icon subtle" aria-label="Open command palette" title="Open command palette">${iconMarkup('command')}</button>
            </div>
          </header>
          <section class="pane-stage" data-role="pane-stage"></section>
          <footer class="footer-status" data-role="footer-status"></footer>
        </main>
      </div>
      <div class="overlay-root" data-role="overlay-root"></div>
    </div>
  `;

  return {
    shell: getRole(root, 'workbench-shell'),
    sidebarTabs: getRole(root, 'sidebar-tabs'),
    workspaceDock: getRole(root, 'workspace-dock'),
    workspaceTitle: getRole<HTMLSpanElement>(root, 'workspace-title'),
    headerTitle: getRole<HTMLHeadingElement>(root, 'header-title'),
    headerStatus: getRole<HTMLSpanElement>(root, 'header-status'),
    paneStage: getRole(root, 'pane-stage'),
    footerStatus: getRole(root, 'footer-status'),
    overlayRoot: getRole(root, 'overlay-root'),
  };
}

function getRole<T extends HTMLElement = HTMLDivElement>(root: HTMLDivElement, name: string): T {
  const element = root.querySelector<HTMLElement>(`[data-role="${name}"]`);
  if (!element) {
    throw new Error(`Missing role node: ${name}`);
  }
  return element as T;
}
