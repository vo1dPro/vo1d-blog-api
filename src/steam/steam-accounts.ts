import { z } from 'zod';

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  steamId: z.string().regex(/^\d{17}$/),
  apiKey: z.string().regex(/^[a-fA-F0-9]{32}$/),
});
export type SteamAccount = z.infer<typeof accountSchema>;

/** Configuration is server-only. Never include parser input in errors. */
export function parseSteamAccounts(raw: string): SteamAccount[] {
  if (!raw.trim()) return [];
  try {
    const accounts = z.array(accountSchema).min(1).max(10).parse(JSON.parse(raw));
    if (new Set(accounts.map((account) => account.steamId)).size !== accounts.length)
      throw new Error('Duplicate account');
    return accounts;
  } catch {
    throw new Error(
      'Invalid STEAM_ACCOUNTS: expected 1-10 unique accounts with name, steamId and apiKey',
    );
  }
}
