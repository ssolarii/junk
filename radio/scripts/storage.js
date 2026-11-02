import { resolveTheme } from './themes.js';

const STORAGE_KEY = 'radio:listening:v2';
const LEGACY_KEY = 'radio:listening:v1';

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

/** Local preferences stay usable in memory if browser storage is blocked or full. */
export function createStorage(stations, backend = browserStorage()) {
  const ids = new Set(stations.map(station => station.id));
  const defaults = () => ({
    version: 2,
    favorites: [],
    history: [],
    lastStation: stations[0]?.id ?? null,
    preferences: { mode: 'timed', minutes: 30, pool: 'all', sequence: [], theme: 'classic', radioStatic: false, shuffle: false },
  });
  const validIds = value => Array.isArray(value) ? value.filter(id => ids.has(id)) : [];
  const uniqueIds = value => [...new Set(validIds(value))];
  function validate(value) {
    const result = defaults();
    if (!value || typeof value !== 'object' || ![1, 2].includes(value.version)) return result;
    result.favorites = uniqueIds(value.favorites);
    result.history = validIds(value.history).filter((id, index, entries) => index === 0 || entries[index - 1] !== id).slice(0, 30);
    if (ids.has(value.lastStation)) result.lastStation = value.lastStation;
    const preferences = value.preferences ?? {};
    if (['timed', 'random', 'custom'].includes(preferences.mode)) result.preferences.mode = preferences.mode;
    if ([15, 30, 60].includes(preferences.minutes)) result.preferences.minutes = preferences.minutes;
    if (['all', 'favorites'].includes(preferences.pool)) result.preferences.pool = preferences.pool;
    result.preferences.sequence = uniqueIds(preferences.sequence);
    result.preferences.theme = resolveTheme(preferences.theme).id;
    result.preferences.radioStatic = preferences.radioStatic === true;
    result.preferences.shuffle = preferences.shuffle === true;
    return result;
  }

  let state = defaults();
  try {
    const current = backend?.getItem(STORAGE_KEY);
    const legacy = current === null || current === undefined ? backend?.getItem(LEGACY_KEY) : null;
    state = validate(JSON.parse(current ?? legacy ?? 'null'));
    if (legacy !== null && legacy !== undefined) backend?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* Keep defaults or validated in-memory migration if writing is blocked. */ }
  const load = () => ({ ...state, favorites: [...state.favorites], history: [...state.history],
    preferences: { ...state.preferences, sequence: [...state.preferences.sequence] } });
  function save(value = {}) {
    state = validate({ ...state, ...value, version: 2,
      preferences: { ...state.preferences, ...value?.preferences } });
    try { backend?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep this session's choices. */ }
    return load();
  }
  return {
    load,
    save,
    favorite(id) {
      if (!ids.has(id)) return load();
      return save({ favorites: state.favorites.includes(id)
        ? state.favorites.filter(entry => entry !== id) : [...state.favorites, id] });
    },
    record(id) {
      if (!ids.has(id)) return load();
      return save({ lastStation: id, history: state.history[0] === id ? state.history : [id, ...state.history] });
    },
  };
}
