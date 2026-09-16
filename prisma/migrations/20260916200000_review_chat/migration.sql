-- Phase 3 of Sarah's phone review: the chat that edits the article. Additive only.
-- One row per chat entry. role: user | assistant | change (an applied tool; text is its summary).
CREATE TABLE "ArticleChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "quote" TEXT,
    "imageId" TEXT,
    "toolName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articleId" TEXT NOT NULL,
    CONSTRAINT "ArticleChatMessage_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ArticleChatMessage_articleId_createdAt_idx" ON "ArticleChatMessage"("articleId", "createdAt");
