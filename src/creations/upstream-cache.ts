/**
 * Optional upstream data must not hold public reads hostage once it is cached:
 * expired entries are served immediately while one background request refreshes them.
 * Concurrent first readers share one upstream request.
 */
export class StaleWhileRevalidateCache<T> {
  private readonly entries = new Map<
    string,
    { expires: number; value: Promise<T | undefined>; refreshing: boolean }
  >();

  // The default capacity matches the layout's 2000-entry limit, so a full feed never thrashes.
  constructor(
    private readonly successMs: number,
    private readonly failureMs: number,
    private readonly maxEntries = 2000,
  ) {}

  async get(key: string, load: () => Promise<T | undefined>): Promise<T | undefined> {
    const cached = this.entries.get(key);
    if (cached) {
      if (cached.expires <= Date.now() && !cached.refreshing) {
        cached.refreshing = true;
        void load()
          .catch(() => undefined)
          .then(async (value) => {
            // A failed refresh keeps the last good value and retries after the failure delay.
            if (value !== undefined || (await cached.value) === undefined)
              cached.value = Promise.resolve(value);
            cached.expires = Date.now() + (value === undefined ? this.failureMs : this.successMs);
          })
          .finally(() => {
            cached.refreshing = false;
          });
      }
      return cached.value;
    }
    const entry = {
      expires: Date.now() + this.failureMs,
      value: load().catch(() => undefined),
      refreshing: false,
    };
    this.entries.set(key, entry);
    if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    const value = await entry.value;
    entry.expires = Date.now() + (value === undefined ? this.failureMs : this.successMs);
    return value;
  }
}
