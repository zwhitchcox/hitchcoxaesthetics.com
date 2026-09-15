-- Sarah's phone review (/review). Additive only.
-- Article: the approval record, reading position, writer text held after a
-- decision, "Ask Zane", revisions, and the queue inputs from the ledger.
ALTER TABLE "Article" ADD COLUMN "reviewAidJson" TEXT;
ALTER TABLE "Article" ADD COLUMN "reviewAidHash" TEXT;
ALTER TABLE "Article" ADD COLUMN "approvedBodyHash" TEXT;
ALTER TABLE "Article" ADD COLUMN "readToParagraph" INTEGER;
ALTER TABLE "Article" ADD COLUMN "readReachedEndAt" DATETIME;
ALTER TABLE "Article" ADD COLUMN "incomingBody" TEXT;
ALTER TABLE "Article" ADD COLUMN "incomingBodyHash" TEXT;
ALTER TABLE "Article" ADD COLUMN "incomingAt" DATETIME;
ALTER TABLE "Article" ADD COLUMN "skippedUntil" DATETIME;
ALTER TABLE "Article" ADD COLUMN "question" TEXT;
ALTER TABLE "Article" ADD COLUMN "questionAt" DATETIME;
ALTER TABLE "Article" ADD COLUMN "answer" TEXT;
ALTER TABLE "Article" ADD COLUMN "answeredAt" DATETIME;
ALTER TABLE "Article" ADD COLUMN "revisionNote" TEXT;
ALTER TABLE "Article" ADD COLUMN "revisionBaseBody" TEXT;
ALTER TABLE "Article" ADD COLUMN "publisherWaiting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Article" ADD COLUMN "placementUsd" INTEGER;
ALTER TABLE "Article" ADD COLUMN "estimatedReadSeconds" INTEGER;

-- Read time for rows that exist already: round(wordCount / 230 * 60).
UPDATE "Article"
SET "estimatedReadSeconds" = CAST(ROUND("wordCount" * 60.0 / 230) AS INTEGER)
WHERE "wordCount" IS NOT NULL AND "estimatedReadSeconds" IS NULL;

-- CreateTable
CREATE TABLE "ArticleReviewEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "paragraph" INTEGER,
    "seconds" INTEGER,
    "note" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articleId" TEXT NOT NULL,
    CONSTRAINT "ArticleReviewEvent_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewSetting" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "emailDaily" BOOLEAN NOT NULL DEFAULT true,
    "emailWeekly" BOOLEAN NOT NULL DEFAULT true,
    "pausedUntil" DATETIME,
    "lastOpenAt" DATETIME,
    "lastDailyEmailAt" DATETIME,
    "lastWeeklyEmailAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ArticleReviewEvent_articleId_at_idx" ON "ArticleReviewEvent"("articleId", "at");

-- CreateIndex
CREATE INDEX "ArticleReviewEvent_kind_at_idx" ON "ArticleReviewEvent"("kind", "at");
