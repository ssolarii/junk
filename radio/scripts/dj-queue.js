/** Ordered session choices. Playing a station does not consume pending tracks. */
export class DJQueue extends EventTarget {
  constructor(items = []) {
    super();
    this._items = [];
    this._serial = 0;
    for (const item of items) this.add(item);
  }

  get snapshot() { return Object.freeze(this._items.map(item => Object.freeze({ ...item }))); }

  add(item, index = this._items.length) {
    if (!item || !['track', 'station'].includes(item.kind) || typeof item.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(item.id)) throw new TypeError('A valid track or station is required.');
    if (this._items.length >= 500) throw new RangeError('The queue is full.');
    const entry = Object.freeze({ kind: item.kind, id: item.id, title: String(item.title || item.name || item.id).slice(0, 500),
      artist: String(item.artist || '').slice(0, 500),
      ...(item.url ? { url: String(item.url) } : {}),
      ...(Number.isFinite(item.duration) && item.duration > 0 ? { duration: item.duration } : {}),
      queueId: `queue-${++this._serial}` });
    this._items.splice(this._index(index), 0, entry);
    this._publish();
    return entry;
  }

  remove(queueId) {
    const index = this._items.findIndex(item => item.queueId === queueId);
    if (index < 0) return false;
    this._items.splice(index, 1); this._publish(); return true;
  }

  move(queueId, index) {
    const from = this._items.findIndex(item => item.queueId === queueId);
    if (from < 0) return false;
    const [entry] = this._items.splice(from, 1);
    this._items.splice(this._index(index), 0, entry);
    this._publish(); return true;
  }

  shift() {
    const entry = this._items.shift() || null;
    if (entry) this._publish();
    return entry;
  }

  clear() { if (this._items.length) { this._items = []; this._publish(); } }
  _index(index) { return Number.isInteger(index) ? Math.max(0, Math.min(index, this._items.length)) : this._items.length; }
  _publish() { this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot })); }
}
