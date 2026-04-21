import { type PaneLeaf, countLeaves, type TabState, type WorkbenchState, type WorkspaceState } from './state';

export type CommandItem = {
  id: string;
  label: string;
  detail: string;
  hotkey?: string;
  aliases: string[];
};

export function buildWorkbenchCommands(
  state: WorkbenchState,
  workspace: WorkspaceState,
  tab: TabState,
  pane: PaneLeaf,
): CommandItem[] {
  const commands: CommandItem[] = [
    {
      id: 'toggle-sidebar',
      label: state.sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar',
      detail: state.sidebarCollapsed ? 'Expand the left rail' : 'Collapse the left rail',
      hotkey: '⌘B · ⌥⇧B',
      aliases: ['toggle sidebar', 'sidebar'],
    },
    {
      id: 'open-appearance',
      label: 'Appearance',
      detail: `Edit theme and terminal font for ${workspace.name}`,
      aliases: ['appearance', 'theme', 'font', 'terminal theme', 'terminal font'],
    },
    {
      id: 'new-tab',
      label: 'New Tab',
      detail: `Create a new tab in ${workspace.name}`,
      hotkey: '⌘T · ⌥⇧T',
      aliases: ['sp new-tab', 'create tab', 'add tab'],
    },
    {
      id: 'rename-tab',
      label: 'Rename Tab',
      detail: `Rename ${tab.title}`,
      aliases: ['rename tab', 'sp tab rename'],
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      detail: `Close ${tab.title}`,
      hotkey: '⌘⌥W · ⌥⇧X',
      aliases: ['close tab', 'delete tab'],
    },
    {
      id: 'rename-pane',
      label: 'Rename Pane',
      detail: `Rename ${pane.title}`,
      aliases: ['rename pane'],
    },
    {
      id: 'split-right',
      label: 'Split Right',
      detail: 'Create a pane to the right',
      hotkey: '⌘D · ⌥⇧L',
      aliases: ['sp new-pane right', 'new pane right', 'split pane right'],
    },
    {
      id: 'split-down',
      label: 'Split Down',
      detail: 'Create a pane below',
      hotkey: '⌘⇧D · ⌥⇧J',
      aliases: ['sp new-pane down', 'new pane down', 'split pane down'],
    },
    {
      id: 'split-left',
      label: 'Split Left',
      detail: 'Create a pane to the left',
      aliases: ['sp new-pane left', 'new pane left'],
    },
    {
      id: 'split-up',
      label: 'Split Up',
      detail: 'Create a pane above',
      aliases: ['sp new-pane up', 'new pane up', 'split pane up'],
    },
    {
      id: 'create-space',
      label: 'Create Space',
      detail: 'Add a new workspace/space',
      aliases: ['new space', 'create workspace', 'sp space create'],
    },
    {
      id: 'rename-space',
      label: 'Rename Space',
      detail: `Rename ${workspace.name}`,
      aliases: ['rename space', 'rename workspace'],
    },
    {
      id: 'delete-space',
      label: 'Delete Space',
      detail: `Delete ${workspace.name}`,
      aliases: ['delete space', 'remove workspace'],
    },
    {
      id: 'next-tab',
      label: 'Next Tab',
      detail: 'Select the next tab',
      hotkey: '⌘⇧]',
      aliases: ['next tab'],
    },
    {
      id: 'previous-tab',
      label: 'Previous Tab',
      detail: 'Select the previous tab',
      hotkey: '⌘⇧[',
      aliases: ['previous tab', 'prev tab'],
    },
  ];

  for (const [index, item] of workspace.tabs.entries()) {
    commands.push({
      id: `select-tab:${item.id}`,
      label: `Go To Tab ${index + 1}`,
      detail: item.title,
      aliases: ['list tabs', item.title.toLowerCase()],
    });
  }

  for (const [index, item] of state.workspaces.entries()) {
    commands.push({
      id: `select-space:${item.id}`,
      label: `Go To Space ${index + 1}`,
      detail: item.name,
      hotkey: index < 9 ? `⌃${index + 1} · ⌥${index + 1}` : '⌃0 · ⌥0',
      aliases: ['list spaces', item.name.toLowerCase(), 'workspace'],
    });
  }

  return commands;
}

export function filterWorkbenchCommands(commands: CommandItem[], query: string): CommandItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return commands;
  return commands.filter((command) => {
    const haystack = [command.label, command.detail, ...command.aliases].join('\n').toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function formatHeaderStatus(tab: TabState): string {
  const paneCount = countLeaves(tab.root);
  return `${paneCount} pane${paneCount === 1 ? '' : 's'} · Working`;
}
