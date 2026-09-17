-- Phase 6 of Sarah's article review: the open questions from the outreach
-- ledger, one row per ask. Additive only.
-- key: the ledger's id for the ask. closedAt: the mini stopped sending it.
-- answeredAt / answeredBy: her answer, read back by the mini through the sync.
CREATE TABLE "ReviewAsk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "targetId" INTEGER,
    "domain" TEXT NOT NULL,
    "ask" TEXT NOT NULL,
    "effort" TEXT,
    "about" TEXT,
    "standing" TEXT,
    "filesJson" TEXT,
    "openedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "answer" TEXT,
    "answeredAt" DATETIME,
    "answeredBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ReviewAsk_key_key" ON "ReviewAsk"("key");
CREATE INDEX "ReviewAsk_closedAt_answeredAt_idx" ON "ReviewAsk"("closedAt", "answeredAt");
CREATE INDEX "ReviewAsk_answeredAt_idx" ON "ReviewAsk"("answeredAt");
