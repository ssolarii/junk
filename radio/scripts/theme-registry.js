/* Classic script and module side-effect import share this one registry.
 * Add a theme with one entry here and its scoped stylesheet. */
globalThis.RadioThemeRegistry = Object.freeze([
  Object.freeze({ id: 'classic', name: 'Classic', colorScheme: 'light', stylesheet: 'themes/classic.css', visualizerSkin: 'classic' }),
  Object.freeze({ id: 'minimalist', name: 'Minimalist', colorScheme: 'light', stylesheet: 'themes/minimalist.css', visualizerSkin: 'minimalist' }),
  Object.freeze({ id: 'vintage', name: 'Vintage', colorScheme: 'light', stylesheet: 'themes/vintage.css', visualizerSkin: 'vintage' }),
  Object.freeze({ id: 'aero', name: 'Aero', colorScheme: 'light', stylesheet: 'themes/aero.css', visualizerSkin: 'aero' }),
]);
