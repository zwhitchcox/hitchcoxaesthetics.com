-- CreateTable
CREATE TABLE "BlvdBookingIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "step" TEXT,
    "bookingCartId" TEXT,
    "bookingLocationId" TEXT,
    "bookingLocationName" TEXT,
    "bookingServiceId" TEXT,
    "bookingServiceName" TEXT,
    "bookingServiceCategory" TEXT,
    "bookingSelectedPaymentType" TEXT,
    "bookingValueUsd" REAL,
    "bookingRequiresCard" BOOLEAN,
    "bookingHasVerifiedMobile" BOOLEAN,
    "bookingHasVerifiedClient" BOOLEAN,
    "appointmentCount" INTEGER,
    "appointmentIds" TEXT,
    "selectedStartTime" DATETIME,
    "selectedEndTime" DATETIME,
    "boulevardClientId" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientFirstName" TEXT,
    "clientLastName" TEXT,
    "bookEntryFromPath" TEXT,
    "bookEntryPagePrefixType" TEXT,
    "bookEntryPageType" TEXT,
    "initialLandingPath" TEXT,
    "initialLandingPagePrefixType" TEXT,
    "initialLandingPageType" TEXT,
    "initialReferrer" TEXT,
    "initialReferringDomain" TEXT,
    "trafficChannel" TEXT,
    "trafficPlatform" TEXT,
    "trafficSourceDetail" TEXT,
    "posthogDistinctId" TEXT,
    "posthogSessionId" TEXT,
    "callrailAccountId" TEXT,
    "callrailCallId" TEXT,
    "callrailSessionId" TEXT,
    "callrailVisitorId" TEXT,
    "callrailPersonId" TEXT,
    "callrailTimelineUrl" TEXT,
    "callrailSource" TEXT,
    "callrailMedium" TEXT,
    "callrailLandingPageUrl" TEXT,
    "callrailLastRequestedUrl" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "fbclid" TEXT,
    "msclkid" TEXT,
    "rawProperties" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BlvdBookingIntent_bookingCartId_key" ON "BlvdBookingIntent"("bookingCartId");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_status_idx" ON "BlvdBookingIntent"("status");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_step_idx" ON "BlvdBookingIntent"("step");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_lastSeenAt_idx" ON "BlvdBookingIntent"("lastSeenAt");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_boulevardClientId_idx" ON "BlvdBookingIntent"("boulevardClientId");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_clientPhone_idx" ON "BlvdBookingIntent"("clientPhone");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_posthogSessionId_idx" ON "BlvdBookingIntent"("posthogSessionId");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_posthogDistinctId_idx" ON "BlvdBookingIntent"("posthogDistinctId");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_callrailCallId_idx" ON "BlvdBookingIntent"("callrailCallId");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_callrailSessionId_idx" ON "BlvdBookingIntent"("callrailSessionId");

-- CreateIndex
CREATE INDEX "BlvdBookingIntent_callrailVisitorId_idx" ON "BlvdBookingIntent"("callrailVisitorId");
