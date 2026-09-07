-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "outreachRowId" INTEGER,
    "outreachArticleId" INTEGER,
    "publication" TEXT,
    "publicationUrl" TEXT,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "dek" TEXT,
    "byline" TEXT,
    "body" TEXT NOT NULL,
    "bodyOriginal" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "previousBody" TEXT,
    "writer" TEXT,
    "isReference" BOOLEAN NOT NULL DEFAULT false,
    "wordCount" INTEGER,
    "linksJson" TEXT,
    "notes" TEXT,
    "outreachStatus" TEXT,
    "liveUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "editedAt" DATETIME,
    "editedBy" TEXT,
    "publishedAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ArticleImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "position" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "altText" TEXT,
    "caption" TEXT,
    "blob" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articleId" TEXT NOT NULL,
    CONSTRAINT "ArticleImage_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_sourceKey_key" ON "Article"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_kind_status_idx" ON "Article"("kind", "status");

-- CreateIndex
CREATE INDEX "ArticleImage_articleId_idx" ON "ArticleImage"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleImage_articleId_fileName_key" ON "ArticleImage"("articleId", "fileName");

