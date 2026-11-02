/** Wall-clock station rotation. The UI owns user pause and interaction boundaries. */
export class AutoDJ extends EventTarget {
  constructor(player, getFavorites, options = {}) {
    super();
    this.player = player;
    this.stations = options.stations ?? player.stations;
    this.getFavorites = getFavorites;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.clearTimer = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    this.running = false;
    this.busy = false;
    this.nextAt = null;
    this.message = 'Auto DJ is off.';
    this.timer = null;
    this.attempted = null;
    this.pendingId = null;
    this.deferredFailure = false;
    this.request = 0;
    this.settings = { mode: 'timed', minutes: 30, pool: 'all', sequence: [] };
    player.addEventListener('change', event => this.onPlayerChange(event.detail ?? player.snapshot));
  }

  get snapshot() {
    return { running: this.running, message: this.message, nextAt: this.nextAt };
  }

  emit() { this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot })); }

  pool() {
    const favorites = new Set(this.getFavorites?.() ?? []);
    const available = this.stations.filter(station => this.settings.pool !== 'favorites' || favorites.has(station.id)).map(station => station.id);
    return this.settings.mode === 'custom'
      ? [...new Set(this.settings.sequence)].filter(id => available.includes(id)) : available;
  }

  start(settings = {}) {
    this.stop();
    this.settings = {
      mode: ['timed', 'random', 'custom'].includes(settings.mode) ? settings.mode : 'timed',
      minutes: [15, 30, 60].includes(settings.minutes) ? settings.minutes : 30,
      pool: settings.pool === 'favorites' ? 'favorites' : 'all',
      sequence: Array.isArray(settings.sequence) ? [...settings.sequence] : [],
    };
    if (this.pool().length < 2) {
      this.message = 'Choose at least two stations for Auto DJ.';
      this.emit();
      return false;
    }
    this.running = true;
    this.message = 'Auto DJ is on.';
    this.resetDeadline();
    return true;
  }

  stop(message = 'Auto DJ is off.') {
    this.request++;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.running = false;
    this.nextAt = null;
    this.attempted = null;
    this.pendingId = null;
    this.deferredFailure = false;
    this.message = message;
    this.emit();
    return this.snapshot;
  }

  manual() {
    this.request++;
    this.attempted = null;
    this.pendingId = null;
    this.deferredFailure = false;
    if (this.running) this.resetDeadline();
    return this.snapshot;
  }

  setBusy(value) {
    this.busy = Boolean(value);
    if (this.running && !this.busy) {
      if (this.deferredFailure) {
        this.deferredFailure = false;
        this.advance(true);
      } else this.schedule();
    }
    return this.snapshot;
  }

  resetDeadline() {
    this.nextAt = this.now() + this.settings.minutes * 60000;
    this.schedule();
    this.emit();
  }

  schedule() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    if (!this.running || this.busy) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (!this.running || this.busy) return;
      if (this.now() < this.nextAt) this.schedule();
      else this.advance(false);
    }, Math.max(0, this.nextAt - this.now()));
  }

  onPlayerChange(snapshot) {
    if (!this.running || snapshot.station?.id !== this.pendingId) return;
    if (snapshot.state.toLowerCase() === 'playing') {
      this.attempted = null;
      this.deferredFailure = false;
    } else if (snapshot.state.toLowerCase() === 'unavailable') {
      if (this.busy) this.deferredFailure = true;
      else this.advance(true);
    }
  }

  advance(skipping) {
    const pool = this.pool();
    if (pool.length < 2) return this.stop('Auto DJ stopped. Choose at least two stations.');
    const current = this.player.snapshot.station?.id;
    if (!skipping || !this.attempted) this.attempted = new Set([current]);
    const eligible = pool.filter(id => id !== current && !this.attempted.has(id));
    if (eligible.length === 0) return this.stop('Auto DJ stopped. These stations are not responding. Try another station.');
    let id;
    if (this.settings.mode === 'random') {
      id = eligible[Math.floor(Math.random() * eligible.length)];
    } else {
      const index = pool.indexOf(current);
      for (let offset = 1; offset <= pool.length; offset++) {
        const candidate = pool[(index + offset) % pool.length];
        if (eligible.includes(candidate)) { id = candidate; break; }
      }
    }
    this.attempted.add(id);
    this.pendingId = id;
    this.message = skipping ? 'Station unavailable. Trying the next station.' : 'Auto DJ is on.';
    this.resetDeadline();
    const request = ++this.request;
    try {
      const result = this.player.select(id);
      result?.catch?.(() => {
        if (this.running && request === this.request && this.pendingId === id) this.onPlayerChange({ station: { id }, state: 'unavailable' });
      });
    } catch {
      if (this.running && this.pendingId === id) this.onPlayerChange({ station: { id }, state: 'unavailable' });
    }
  }
}
