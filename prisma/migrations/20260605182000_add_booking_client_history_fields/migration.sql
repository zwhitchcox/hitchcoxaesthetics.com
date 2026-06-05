ALTER TABLE "BlvdBookingIntent" ADD COLUMN "bookingClientHistorySelection" TEXT;
ALTER TABLE "BlvdBookingIntent" ADD COLUMN "bookingClientType" TEXT;
ALTER TABLE "BlvdBookingIntent" ADD COLUMN "bookingClientTypeSource" TEXT;

CREATE INDEX "BlvdBookingIntent_bookingClientHistorySelection_idx" ON "BlvdBookingIntent"("bookingClientHistorySelection");
CREATE INDEX "BlvdBookingIntent_bookingClientType_idx" ON "BlvdBookingIntent"("bookingClientType");
