ALTER TABLE "CallRailCall" ADD COLUMN "outcome" TEXT;
ALTER TABLE "CallRailCall" ADD COLUMN "disposition" TEXT;
ALTER TABLE "CallRailCall" ADD COLUMN "lostReason" TEXT;
ALTER TABLE "CallRailCall" ADD COLUMN "frustrationReason" TEXT;
ALTER TABLE "CallRailCall" ADD COLUMN "agentFixSuggestion" TEXT;
ALTER TABLE "CallRailCall" ADD COLUMN "followUpNeeded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CallRailCall" ADD COLUMN "callrailTagsSyncedAt" DATETIME;
ALTER TABLE "CallRailCall" ADD COLUMN "mistakeReviewedAt" DATETIME;

CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'call_analysis',
    "callrailCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "contactedAt" DATETIME,
    "contactedVia" TEXT,
    "contactedRef" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "FollowUp_callrailCallId_key" ON "FollowUp"("callrailCallId");
CREATE INDEX "FollowUp_status_idx" ON "FollowUp"("status");
CREATE INDEX "FollowUp_customerPhone_idx" ON "FollowUp"("customerPhone");

CREATE TABLE "GoogleOAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountEmail" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scope" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
