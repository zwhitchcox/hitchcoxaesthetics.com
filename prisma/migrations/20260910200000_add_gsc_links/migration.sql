-- Google's own view of who links to us, pushed from the Mac mini.
CREATE TABLE "GscLinkPull" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "property" TEXT NOT NULL,
    "pulledAt" DATETIME NOT NULL,
    "sites" INTEGER NOT NULL,
    "linkingPages" INTEGER NOT NULL,
    "realSites" INTEGER NOT NULL DEFAULT 0,
    "spamSites" INTEGER NOT NULL DEFAULT 0,
    "oursSites" INTEGER NOT NULL DEFAULT 0,
    "searchSites" INTEGER NOT NULL DEFAULT 0,
    "ourLiveLinks" INTEGER NOT NULL DEFAULT 0,
    "pickedUp" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'shade',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GscLinkPull_property_pulledAt_key" ON "GscLinkPull"("property", "pulledAt");
CREATE INDEX "GscLinkPull_property_pulledAt_idx" ON "GscLinkPull"("property", "pulledAt");

CREATE TABLE "GscLinkSite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pullId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "root" TEXT NOT NULL,
    "linkingPages" INTEGER,
    "targetPages" INTEGER,
    "klass" TEXT,
    "spam" BOOLEAN NOT NULL DEFAULT false,
    "ours" BOOLEAN NOT NULL DEFAULT false,
    "isOurLink" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "GscLinkSite_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "GscLinkPull" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GscLinkSite_pullId_idx" ON "GscLinkSite"("pullId");
CREATE INDEX "GscLinkSite_root_idx" ON "GscLinkSite"("root");
