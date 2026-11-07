// Wide (Mac) layout: from 1024 px of window width. Below that the phone layout is used.
export const WIDE_QUERY = '(min-width: 1024px)';

export function isWide() {
  return window.matchMedia(WIDE_QUERY).matches;
}

// Calls fn(wide) whenever the window crosses 1024 px. Returns a function that stops listening.
export function onWideChange(fn) {
  const mq = window.matchMedia(WIDE_QUERY);
  const listener = e => fn(e.matches);
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}
