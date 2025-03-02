/*
  Warnings:

  - You are about to drop the `Password` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `ownerId` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `User` table. All the data in the column will be lost.
  - Added the required column `clientId` to the `Note` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Password_userId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Password";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "body" TEXT,
    "duration" INTEGER NOT NULL,
    "order" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "start" DATETIME,
    "end" DATETIME,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "providerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientHistoryForm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" REAL NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ClientHistoryField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "prompt" TEXT NOT NULL,
    "order" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "formId" TEXT NOT NULL,
    CONSTRAINT "ClientHistoryField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ClientHistoryForm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientHistoryFieldOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "order" REAL NOT NULL,
    CONSTRAINT "ClientHistoryFieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ClientHistoryField" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientHistoryRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answer" TEXT,
    "fieldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientHistoryRecord_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ClientHistoryField" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientHistoryRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoogleLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "formattedAddress" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "apt" TEXT,
    "city" TEXT,
    "neighborhood" TEXT,
    "county" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zip" TEXT,
    "zip4" TEXT,
    "lat" REAL,
    "lng" REAL,
    "url" TEXT,
    "json" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BlockedTime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BlockedTime_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "WeeklySchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoogleReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "starRating" TEXT NOT NULL,
    "comment" TEXT,
    "createTime" DATETIME NOT NULL,
    "updateTime" DATETIME NOT NULL,
    "profilePhotoUrl" TEXT,
    "reviewerName" TEXT NOT NULL,
    "hasReply" BOOLEAN NOT NULL DEFAULT false,
    "replyComment" TEXT,
    "replyTime" DATETIME,
    "locationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleReview_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GoogleLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "averageRating" REAL NOT NULL DEFAULT 0,
    "oneStarCount" INTEGER NOT NULL DEFAULT 0,
    "twoStarCount" INTEGER NOT NULL DEFAULT 0,
    "threeStarCount" INTEGER NOT NULL DEFAULT 0,
    "fourStarCount" INTEGER NOT NULL DEFAULT 0,
    "fiveStarCount" INTEGER NOT NULL DEFAULT 0,
    "repliedCount" INTEGER NOT NULL DEFAULT 0,
    "unrepliedCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyReviews" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewStats_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GoogleLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ServiceToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ServiceToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ServiceToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ClientHistoryFieldOptionToClientHistoryRecord" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ClientHistoryFieldOptionToClientHistoryRecord_A_fkey" FOREIGN KEY ("A") REFERENCES "ClientHistoryFieldOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ClientHistoryFieldOptionToClientHistoryRecord_B_fkey" FOREIGN KEY ("B") REFERENCES "ClientHistoryRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "clientId" TEXT NOT NULL,
    CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("content", "createdAt", "id", "title", "updatedAt") SELECT "content", "createdAt", "id", "title", "updatedAt" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_clientId_idx" ON "Note"("clientId");
CREATE INDEX "Note_clientId_updatedAt_idx" ON "Note"("clientId", "updatedAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "type" TEXT NOT NULL DEFAULT 'client',
    "dob" DATETIME,
    "locationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GoogleLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "updatedAt") SELECT "createdAt", "email", "id", "name", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_key_check("Note");
PRAGMA foreign_key_check("User");
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientHistoryForm_slug_key" ON "ClientHistoryForm"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientHistoryField_slug_key" ON "ClientHistoryField"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientHistoryFieldOption_fieldId_value_key" ON "ClientHistoryFieldOption"("fieldId", "value");

-- CreateIndex
CREATE INDEX "ClientHistoryRecord_userId_fieldId_idx" ON "ClientHistoryRecord"("userId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientHistoryRecord_userId_fieldId_key" ON "ClientHistoryRecord"("userId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "Address_userId_key" ON "Address"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySchedule_userId_dayOfWeek_key" ON "WeeklySchedule"("userId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleReview_reviewId_key" ON "GoogleReview"("reviewId");

-- CreateIndex
CREATE INDEX "GoogleReview_locationId_idx" ON "GoogleReview"("locationId");

-- CreateIndex
CREATE INDEX "GoogleReview_createTime_idx" ON "GoogleReview"("createTime");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewStats_locationId_key" ON "ReviewStats"("locationId");

-- CreateIndex
CREATE INDEX "ReviewStats_locationId_idx" ON "ReviewStats"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "_ServiceToUser_AB_unique" ON "_ServiceToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_ServiceToUser_B_index" ON "_ServiceToUser"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ClientHistoryFieldOptionToClientHistoryRecord_AB_unique" ON "_ClientHistoryFieldOptionToClientHistoryRecord"("A", "B");

-- CreateIndex
CREATE INDEX "_ClientHistoryFieldOptionToClientHistoryRecord_B_index" ON "_ClientHistoryFieldOptionToClientHistoryRecord"("B");
