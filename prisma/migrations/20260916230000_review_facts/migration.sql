-- Phase 5 of Sarah's article review: the fact bank. Additive only.
-- One row per thing Sarah told us. source: grill | docs | manual.
-- key: the stable id of a docs row (null for grill and manual rows).
CREATE TABLE "ReviewFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'grill',
    "key" TEXT,
    "question" TEXT,
    "answer" TEXT,
    "fact" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "retiredAt" DATETIME,
    "articleId" TEXT,
    CONSTRAINT "ReviewFact_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReviewFact_key_key" ON "ReviewFact"("key");
CREATE INDEX "ReviewFact_source_retiredAt_idx" ON "ReviewFact"("source", "retiredAt");
CREATE INDEX "ReviewFact_updatedAt_idx" ON "ReviewFact"("updatedAt");
