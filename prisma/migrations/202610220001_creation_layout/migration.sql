CREATE TABLE "creation_layout" (
 "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY CHECK ("id" = 1),
 "revision" INTEGER NOT NULL DEFAULT 0,
 "config" JSONB NOT NULL DEFAULT '{"categories":[],"entries":[]}'
);
INSERT INTO "creation_layout" ("id") VALUES (1);
