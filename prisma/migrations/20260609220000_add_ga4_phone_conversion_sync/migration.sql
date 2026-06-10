ALTER TABLE "CallTrackingSessionAttribution" ADD COLUMN "gaClientId" TEXT;
ALTER TABLE "CallTrackingSessionAttribution" ADD COLUMN "gaSessionId" TEXT;

CREATE INDEX "CallTrackingSessionAttribution_gclid_idx" ON "CallTrackingSessionAttribution"("gclid");

CREATE TABLE "Ga4PhoneConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callrailCallId" TEXT NOT NULL,
    "callrailAccountId" TEXT,
    "gclid" TEXT,
    "gaClientId" TEXT,
    "gaSessionId" TEXT,
    "attributionMatch" TEXT,
    "valueUsd" REAL,
    "callStartedAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Ga4PhoneConversion_callrailCallId_key" ON "Ga4PhoneConversion"("callrailCallId");
CREATE INDEX "Ga4PhoneConversion_gclid_idx" ON "Ga4PhoneConversion"("gclid");
CREATE INDEX "Ga4PhoneConversion_sentAt_idx" ON "Ga4PhoneConversion"("sentAt");
