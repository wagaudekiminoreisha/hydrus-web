import { viewerKeyboardAction, viewerKeyboardTargetOwnsEvent } from './viewer-keyboard';

describe('Viewer keyboard ownership', () => {
  function eventFor(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...options});
    target.dispatchEvent(event);
    return event;
  }

  it('keeps browser save and operating-system shortcuts intact', () => {
    const target = document.createElement('div');
    expect(viewerKeyboardTargetOwnsEvent(eventFor(target, 's', {ctrlKey: true}))).toBeTrue();
    expect(viewerKeyboardTargetOwnsEvent(eventFor(target, 's', {metaKey: true}))).toBeTrue();
    expect(viewerKeyboardTargetOwnsEvent(eventFor(target, 'ArrowLeft', {altKey: true}))).toBeTrue();
  });

  it('does not select files while typing in a field or rich-text editor', () => {
    const input = document.createElement('input');
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    const child = document.createElement('span');
    editor.append(child);
    expect(viewerKeyboardTargetOwnsEvent(eventFor(input, 's'))).toBeTrue();
    expect(viewerKeyboardTargetOwnsEvent(eventFor(child, 's'))).toBeTrue();
    expect(viewerKeyboardTargetOwnsEvent(eventFor(input, 'ArrowRight'))).toBeTrue();
  });

  it('preserves native player seeking, volume, and space controls', () => {
    const video = document.createElement('video');
    for(const key of ['ArrowRight', 'ArrowUp', ' ', 's']) {
      expect(viewerKeyboardTargetOwnsEvent(eventFor(video, key))).toBeTrue();
    }
    expect(viewerKeyboardTargetOwnsEvent(eventFor(video, 'Escape'))).toBeFalse();
  });

  it('distinguishes toggling selection from selecting and advancing', () => {
    const target = document.createElement('div');
    expect(viewerKeyboardAction(eventFor(target, 's'))).toBe('select');
    expect(viewerKeyboardAction(eventFor(target, 'S', {shiftKey: true}))).toBe('select-next');
    expect(viewerKeyboardAction(eventFor(target, '?', {shiftKey: true}))).toBe('help');
  });

  it('lets Space activate a focused button without also toggling the slideshow', () => {
    expect(viewerKeyboardAction(eventFor(document.createElement('button'), ' '))).toBeUndefined();
    expect(viewerKeyboardAction(eventFor(document.createElement('div'), ' '))).toBe('slideshow');
  });
});
