# Postcard mailings

`mailed-routes.csv` lists every carrier route we mailed, one row per route. Check it before a new
mailing, so we skip those homes or mail them again on purpose.

- `homes`: the residential count PrintingForLess mailed on that route (EDDM, residential only).
- `order_total_usd`: the whole order total with sales tax, repeated on each route row of the order.
- `qr_link`: the short link on that version's QR code. Scans and bookings show in the Revenue page
  (/admin/reports/revenue) as "Postcard · <utm_content>".

## 2026-11 weight loss A/B test

- Ordered 2026-10-23 from PrintingForLess, EDDM, 9 x 6.25, 100# Gloss Cover, normal 4-day production.
- A, P3632204064: "Your favorite jeans called", 6 routes, 2,822 homes, $1,525.64.
- B, P3632205033: "Turn down the food noise", 6 routes, 2,737 homes, $1,487.80.
- Print files: `reports/postcards/final/` (not in git). The order form upload failed for A, so the
  files for both orders go to PrintingForLess (Info@pfl.com) by email from sarah@hitchcoxaesthetics.com.
- Weight loss print files v2 (2026-10-23): the prices now read "$150/month" and "$250/month". The v2 files went to
  PrintingForLess by email in the same thread. Check that the proofs show "/month" before approving them.

## 2026-11 Botox mailing

- Ordered 2026-10-23 from PrintingForLess, EDDM, 9 x 6.25, 100# Gloss Cover, normal 4-day production.
- C, P3632756019: "Relax. It's just Botox." (1950s ad), 12 routes, 5,442 homes, $2,694.17.
- Route choice: routes within 2 miles of an office that did not get the weight-loss card, with median
  income of $60k or more and median age of 35 or more. See `reports/Botox client demographics 2026-10.md`.
- QR code: hitchcoxaesthetics.com/m/bx-relax. Print files: `reports/postcards/botox-1950s/upload/` (not in
  git). The order form upload failed again, so the files go to PrintingForLess by email.
