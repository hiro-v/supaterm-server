export function iconMarkup(name: 'close' | 'command' | 'rename' | 'sidebar' | 'theme'): string {
  switch (name) {
    case 'rename':
      return '<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5V13h1.5l6.9-6.9-1.5-1.5L3 11.5Z"/><path d="m9.8 3.8 1.5-1.5 1.9 1.9-1.5 1.5"/></svg>';
    case 'close':
      return '<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4 12 12"/><path d="M12 4 4 12"/></svg>';
    case 'sidebar':
      return '<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.7"/><path d="M6.1 3v10"/></svg>';
    case 'command':
      return '<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.8a2.2 2.2 0 1 0 0 4.4h6"/><path d="M11 2.8a2.2 2.2 0 1 1 0 4.4H5"/><path d="M5 8.8a2.2 2.2 0 1 0 0 4.4h6"/><path d="M11 8.8a2.2 2.2 0 1 1 0 4.4H5"/></svg>';
    case 'theme':
      return '<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.3a4.9 4.9 0 1 0 4.9 4.9c0-.8-.2-1.5-.5-2.2-.6.9-1.6 1.5-2.8 1.5-1.9 0-3.4-1.5-3.4-3.4 0-.2 0-.5.1-.8-.7 0-1.5.1-2.3.4"/><circle cx="10.9" cy="4.2" r=".7" fill="currentColor" stroke="none"/><circle cx="12.3" cy="6.1" r=".7" fill="currentColor" stroke="none"/><circle cx="11.1" cy="8.2" r=".7" fill="currentColor" stroke="none"/></svg>';
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

export function formatMetric(
  value: number | null | undefined,
  unit: string,
  options: { precision?: number } = {},
): string {
  if (value == null || !Number.isFinite(value)) return `-- ${unit}`;
  const precision = options.precision ?? 0;
  const rounded = precision > 0 ? value.toFixed(precision) : String(Math.round(value));
  return `${rounded} ${unit}`;
}
