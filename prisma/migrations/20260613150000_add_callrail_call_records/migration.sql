CREATE TABLE "CallRailCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callrailCallId" TEXT NOT NULL,
    "callrailAccountId" TEXT,
    "source" TEXT,
    "callerPhone" TEXT,
    "durationSeconds" INTEGER,
    "answered" BOOLEAN,
    "startedAt" DATETIME,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "receivedEventAt" DATETIME,
    "conversionEventAt" DATETIME,
    "analyzedAt" DATETIME,
    "analysisJson" TEXT,
    "analysisError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CallRailCall_callrailCallId_key" ON "CallRailCall"("callrailCallId");
CREATE INDEX "CallRailCall_startedAt_idx" ON "CallRailCall"("startedAt");
CREATE INDEX "CallRailCall_qualified_idx" ON "CallRailCall"("qualified");
