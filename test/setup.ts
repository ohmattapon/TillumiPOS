import { Window } from 'happy-dom'

const window = new Window({ url: 'http://localhost/' })
const target = globalThis as Record<string, unknown>
const source = window as unknown as Record<string, unknown>

// Methods that must stay bound to our window instance.
const boundMethods = new Set([
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'scrollTo',
  'getSelection',
])

target.window ??= window

// Bun ships native DOM-ish globals (Event, CustomEvent, MutationObserver, …)
// that are NOT the same classes as happy-dom's nodes. Radix creates events
// from the globals and dispatches them on happy-dom nodes, so every name on
// this list must resolve to our window's copy — always override, never keep
// the native one.
for (const name of [
  'document',
  'navigator',
  'location',
  'history',
  'customElements',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLFormElement',
  'HTMLLabelElement',
  'SVGElement',
  'Element',
  'Node',
  'Text',
  'Comment',
  'Document',
  'DocumentFragment',
  'ShadowRoot',
  'NodeList',
  'HTMLCollection',
  'NodeFilter',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'PointerEvent',
  'WheelEvent',
  'EventTarget',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'scrollTo',
  'getSelection',
  'Range',
  'DOMRect',
  'CSS',
  'DOMParser',
  'localStorage',
  'sessionStorage',
]) {
  if (source[name] !== undefined) {
    const value = source[name]
    target[name] =
      boundMethods.has(name) && typeof value === 'function'
        ? (value as (...args: never[]) => unknown).bind(window)
        : value
  }
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true
