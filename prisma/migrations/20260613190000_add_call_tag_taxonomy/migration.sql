CREATE TABLE "CallTagGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CallTagGroup_name_key" ON "CallTagGroup"("name");

CREATE TABLE "CallTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" REAL NOT NULL DEFAULT 0,
    "groupId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallTag_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CallTagGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CallTag_groupId_value_key" ON "CallTag"("groupId", "value");

ALTER TABLE "CallRailCall" ADD COLUMN "analysisSource" TEXT;
