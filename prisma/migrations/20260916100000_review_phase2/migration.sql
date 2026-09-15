-- Phase 2 of Sarah's phone review. Additive only.
-- Article: "Write a different article" asks the mini for a clean-room draft.
ALTER TABLE "Article" ADD COLUMN "rewriteRequested" BOOLEAN NOT NULL DEFAULT false;
-- ArticleImage: pixel size of the stored picture, so the page reserves the box.
ALTER TABLE "ArticleImage" ADD COLUMN "width" INTEGER;
ALTER TABLE "ArticleImage" ADD COLUMN "height" INTEGER;
