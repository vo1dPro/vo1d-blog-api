import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaleWhileRevalidateCache } from './upstream-cache.js';

afterEach(() => vi.useRealTimers());
describe('stale-while-revalidate upstream cache', () => {
  it('serves an expired value immediately and refreshes it once in the background', async () => {
    vi.useFakeTimers();
    const cache = new StaleWhileRevalidateCache<string>(1000, 100);
    expect(await cache.get('k', () => Promise.resolve('first'))).toBe('first');
    vi.advanceTimersByTime(1001);
    let release: ((value: string) => void) | undefined;
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    expect(await cache.get('k', load)).toBe('first');
    expect(await cache.get('k', load)).toBe('first');
    expect(load).toHaveBeenCalledTimes(1);
    release?.('second');
    await vi.runAllTimersAsync();
    expect(await cache.get('k', load)).toBe('second');
  });
  it('keeps the last good value when a refresh fails', async () => {
    vi.useFakeTimers();
    const cache = new StaleWhileRevalidateCache<string>(1000, 100);
    await cache.get('k', () => Promise.resolve('good'));
    vi.advanceTimersByTime(1001);
    await cache.get('k', () => Promise.reject(new Error('offline')));
    await vi.runAllTimersAsync();
    expect(await cache.get('k', () => Promise.resolve('never'))).toBe('good');
  });
  it('evicts the oldest entry beyond capacity', async () => {
    const cache = new StaleWhileRevalidateCache<string>(1000, 100, 1);
    await cache.get('a', () => Promise.resolve('a'));
    await cache.get('b', () => Promise.resolve('b'));
    const load = vi.fn(() => Promise.resolve('a2'));
    expect(await cache.get('a', load)).toBe('a2');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
