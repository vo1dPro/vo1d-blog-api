CREATE TABLE "creation_posts" (
    "id" SERIAL NOT NULL,
    "platform" VARCHAR(24) NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "creation_posts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "creation_posts_platform_externalId_key" ON "creation_posts"("platform", "externalId");
CREATE INDEX "creation_posts_deletedAt_publishedAt_id_idx" ON "creation_posts"("deletedAt", "publishedAt" DESC, "id" DESC);
