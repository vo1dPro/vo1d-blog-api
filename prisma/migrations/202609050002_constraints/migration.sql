-- PostgreSQL invariants not expressible in the Prisma schema language.
ALTER TABLE books ADD CONSTRAINT books_progress_range CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE games ADD CONSTRAINT games_rating_range CHECK (rating BETWEEN 0 AND 10);
ALTER TABLE games ADD CONSTRAINT games_like_level_range CHECK ("likeLevel" BETWEEN 0 AND 5);
ALTER TABLE games ADD CONSTRAINT games_playtime_nonnegative CHECK ("playtimeHours" >= 0);
ALTER TABLE site_profiles ADD CONSTRAINT site_profiles_singleton CHECK (id = 1);
ALTER TABLE articles ADD CONSTRAINT articles_reading_time_positive CHECK ("readingTimeMinutes" BETWEEN 1 AND 1440);
ALTER TABLE articles ADD CONSTRAINT articles_publication_date CHECK (status <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);
ALTER TABLE admin_users ADD CONSTRAINT admin_users_email_normalized CHECK (email = lower(btrim(email)));
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_hash_format CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE media_assets ADD CONSTRAINT media_assets_metadata_valid CHECK (
  "sizeBytes" > 0 AND (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
);
ALTER TABLE media_assets ADD CONSTRAINT media_assets_safe_key CHECK (
  "objectKey" ~ '^media/[a-zA-Z0-9/_-]+[.](webp|png|jpg|jpeg)$'
  AND "objectKey" NOT LIKE '%..%'
);
-- Guard avatar references against concurrent deletion as well as service checks.
ALTER TABLE site_profiles DROP CONSTRAINT "site_profiles_avatarMediaId_fkey";
ALTER TABLE site_profiles ADD CONSTRAINT "site_profiles_avatarMediaId_fkey"
  FOREIGN KEY ("avatarMediaId") REFERENCES media_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE;
