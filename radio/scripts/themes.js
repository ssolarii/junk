import './theme-registry.js';

export const themes = globalThis.RadioThemeRegistry;
export const DEFAULT_THEME = 'classic';
export function resolveTheme(id) {
  return themes.find(theme => theme.id === id) ?? themes.find(theme => theme.id === DEFAULT_THEME);
}
export function getTheme(root = document.documentElement) {
  return resolveTheme(root.dataset.theme);
}

/** Appearance only: callers persist the choice. No player or audio dependencies. */
export function applyTheme(id, root = document.documentElement) {
  const theme = resolveTheme(id);
  const changed = root.dataset.theme !== theme.id;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.colorScheme;
  if (changed) root.ownerDocument.dispatchEvent(new CustomEvent('radio:themechange', { detail: { theme } }));
  return theme;
}
