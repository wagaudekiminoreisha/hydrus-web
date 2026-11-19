export type ViewerKeyboardAction = 'select' | 'select-next' | 'slideshow' | 'selection-actions' | 'info' | 'download' | 'help';

export const VIEWER_SHORTCUTS = [
  {keys: 'S', action: 'Select or deselect the current file'},
  {keys: 'Shift + S', action: 'Select the current file and go to the next'},
  {keys: 'Space / P', action: 'Start or stop automatic slideshow advancement'},
  {keys: 'A', action: 'Open actions for the selected files'},
  {keys: 'I', action: 'Show file info'},
  {keys: 'D', action: 'Download the current file'},
  {keys: '\u2190 / \u2192', action: 'Previous or next file'},
  {keys: 'Z', action: 'Toggle image zoom'},
  {keys: '?', action: 'Show keyboard shortcuts'},
  {keys: 'Esc', action: 'Close the active popup or viewer'}
];

/** Leave typing, browser shortcuts, and native media controls to their owners. */
export function viewerKeyboardTargetOwnsEvent(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey
    || !!(event.target as Element)?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"]')
    || (event.key !== 'Escape' && !!(event.target as Element)?.closest?.('video, audio'));
}

export function viewerKeyboardAction(event: KeyboardEvent): ViewerKeyboardAction | undefined {
  const key = event.key.toLowerCase();
  if (key === '?') return 'help';
  if (key === 's') return event.shiftKey ? 'select-next' : 'select';
  if (event.shiftKey) return undefined;
  // A focused button keeps Space/Enter activation; avoid also running a shortcut.
  if (key === ' ' && (event.target as Element)?.closest?.('button, a, [role="button"]')) return undefined;
  return ({' ': 'slideshow', p: 'slideshow', a: 'selection-actions', i: 'info', d: 'download'} as const)[key];
}
