CREATE TYPE "MediaStorage" AS ENUM ('OBJECT_STORAGE', 'DATABASE');

ALTER TABLE "media_assets"
  ADD COLUMN "storage" "MediaStorage" NOT NULL DEFAULT 'OBJECT_STORAGE';

CREATE TABLE "media_contents" (
  "mediaId" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  CONSTRAINT "media_contents_pkey" PRIMARY KEY ("mediaId"),
  CONSTRAINT "media_contents_mediaId_fkey" FOREIGN KEY ("mediaId")
    REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "media_contents_size_check" CHECK (octet_length("bytes") BETWEEN 1 AND 10485760),
  CONSTRAINT "media_contents_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$')
);
