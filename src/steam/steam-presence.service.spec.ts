import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../config/app-config.service.js';
import type { Environment } from '../config/environment.js';
import { SteamClient, SteamUpstreamError } from './steam.client.js';
import { SteamPresenceService } from './steam-presence.service.js';

function fixture(enabled = true) {
  const config = new AppConfigService(new ConfigService<Environment, true>());
  const account = { name: 'test', steamId: '76561198000000000', apiKey: 'unused-test-key' };
  vi.spyOn(config, 'steam', 'get').mockReturnValue({
    enabled,
    accounts: [account],
    ...account,
    intervalMs: 300000,
    timeoutMs: 1000,
  });
  const client = new SteamClient(config);
  return {
    service: new SteamPresenceService(config, client),
    query: vi.spyOn(client, 'getPlayingApp'),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Steam presence freshness', () => {
  it('shares simultaneous requests and cached snapshots without persisting stale playing status', async () => {
    vi.useFakeTimers();
    const { service, query } = fixture();
    query.mockResolvedValueOnce(730).mockRejectedValueOnce(new SteamUpstreamError('NETWORK'));
    const [first, second] = await Promise.all([service.read(), service.read()]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ state: 'playing', appId: 730 });
    expect(await service.read()).toEqual(first);
    expect(query).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(180001);
    expect(await service.read()).toMatchObject({
      state: 'unavailable',
      appId: null,
      refreshAfterMs: 30000,
    });
  });
  it('keeps idle and unconfigured distinct, and never queries disabled configuration', async () => {
    const idle = fixture();
    idle.query.mockResolvedValue(null);
    expect(await idle.service.read()).toMatchObject({ state: 'idle', appId: null });
    const disabled = fixture(false);
    expect(await disabled.service.read()).toMatchObject({ state: 'unconfigured', appId: null });
    expect(disabled.query).not.toHaveBeenCalled();
  });
  it('backs off rate limits without reusing a playing snapshot', async () => {
    const { service, query } = fixture();
    query.mockRejectedValue(new SteamUpstreamError('RATE_LIMITED'));
    expect(await service.read()).toMatchObject({
      state: 'unavailable',
      appId: null,
      refreshAfterMs: 180000,
    });
  });
});
