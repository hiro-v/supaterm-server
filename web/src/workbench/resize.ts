import { type TabState, findSplitNode } from './state';
import { clamp } from './shared';

export type ResizeState = {
  splitId: string;
  axis: 'row' | 'column';
  startPointer: number;
  startRatio: number;
};

export function beginWorkbenchResize(
  target: HTMLElement | null,
  tab: TabState,
  pointer: { clientX: number; clientY: number },
): ResizeState | null {
  const handle = target?.closest<HTMLElement>('[data-split-id]');
  if (!handle || !handle.classList.contains('split-handle')) return null;

  const axis = handle.dataset.axis === 'column' ? 'column' : 'row';
  const splitId = handle.dataset.splitId;
  if (!splitId) return null;

  const split = findSplitNode(tab.root, splitId);
  if (!split) return null;

  return {
    splitId,
    axis,
    startPointer: axis === 'row' ? pointer.clientX : pointer.clientY,
    startRatio: split.ratio,
  };
}

export function updateWorkbenchResize(
  resizeState: ResizeState,
  tab: TabState,
  root: ParentNode,
  pointer: { clientX: number; clientY: number },
): boolean {
  const split = findSplitNode(tab.root, resizeState.splitId);
  if (!split) return false;

  const host = root.querySelector<HTMLElement>(`[data-split-host="${split.id}"]`);
  if (!host) return false;

  const rect = host.getBoundingClientRect();
  const total = resizeState.axis === 'row' ? rect.width : rect.height;
  if (total <= 0) return false;

  const delta = (resizeState.axis === 'row' ? pointer.clientX : pointer.clientY) - resizeState.startPointer;
  split.ratio = clamp(resizeState.startRatio + (delta / total), 0.2, 0.8);
  return true;
}
