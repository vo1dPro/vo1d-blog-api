ALTER TABLE "games" ADD COLUMN "steamAppId" INTEGER;
CREATE UNIQUE INDEX "games_steamAppId_key" ON "games"("steamAppId");
ALTER TABLE "games" ADD CONSTRAINT "games_steam_app_positive" CHECK ("steamAppId" IS NULL OR "steamAppId" > 0);

CREATE TABLE "steam_games" (
  "id" SERIAL NOT NULL,
  "steamId" TEXT NOT NULL,
  "appId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "playtimeMinutes" INTEGER NOT NULL,
  "playtimeTwoWeeksMinutes" INTEGER,
  "lastPlayedAt" TIMESTAMPTZ(3),
  "isOwned" BOOLEAN NOT NULL DEFAULT true,
  "syncedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "steam_games_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "steam_games_valid_values" CHECK ("steamId" ~ '^[0-9]{17}$' AND "appId" > 0 AND "playtimeMinutes" >= 0 AND ("playtimeTwoWeeksMinutes" IS NULL OR "playtimeTwoWeeksMinutes" >= 0))
);
CREATE UNIQUE INDEX "steam_games_steamId_appId_key" ON "steam_games"("steamId", "appId");
CREATE INDEX "steam_games_steamId_isOwned_playtimeMinutes_idx" ON "steam_games"("steamId", "isOwned", "playtimeMinutes");

CREATE TABLE "steam_sync_states" (
  "id" SERIAL NOT NULL,
  "steamId" TEXT NOT NULL,
  "lastAttemptAt" TIMESTAMPTZ(3),
  "lastSuccessAt" TIMESTAMPTZ(3),
  "nextSyncAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMPTZ(3),
  "lastErrorCode" TEXT,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "libraryVisible" BOOLEAN NOT NULL DEFAULT false,
  "gameCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "steam_sync_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "steam_sync_states_valid_values" CHECK ("steamId" ~ '^[0-9]{17}$' AND "failureCount" >= 0 AND "gameCount" >= 0)
);
CREATE UNIQUE INDEX "steam_sync_states_steamId_key" ON "steam_sync_states"("steamId");
