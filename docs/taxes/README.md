# Tax records

## Files

- `2025-federal-return-turbotax.pdf`: full 2025 federal return (TurboTax).
  Contains SSN; private repo only. Schedule C: gross receipts $393,888,
  total expenses $368,441 (incl. $135,760 depreciation/179), net profit
  $25,447. EIN 99-0431443, code 621111, cash basis.

## 2025 Tennessee filings (status 2026-07-30)

- TN Business Tax (gross receipts tax, account 1002412947-BUS, entity
  SARAH HITCHCOX AESTHETICS, LLC): FILED AND PAID 2026-07-30,
  confirmation 0-940-437-024.
  Bearden location 1001711721, Class 3 retailer, Knox County + Knoxville
  city, rate 0.001875 each. Gross sales $378,470 (Jane invoiced ex sales
  tax; Jane 2025 total both locations $410,181; federal per-deposit figure
  $393,888). Tax $1,420 + penalty $284 (20%, due 2026-04-15, ~105 days
  late) + interest $51.06 = $1,755.06.
- Farragut location (opened 2025-06-24, $31,712 gross in 2025) is UNDER
  the $100,000 per-jurisdiction threshold: no standard business tax
  filing, but it needs a minimal activity license from the Knox County
  Clerk (and check Town of Farragut). Owner errand, ~$15.
- Franchise & Excise: RESOLVED understanding (2026-07-30). The F&E
  account EXISTS: 1002585758-FAE, registered under the OTHER TNTAP
  customer (SARAH HITCHCOX AESTHETICS, SSN-based, 536 Noelton Dr), not
  the LLC customer. TN operations began 01-Jan-2024 per the filed 2024
  FAE170 (processed on time, confirmation 1-223-297-984, CPA-prepared).
  Key mechanics for this business (individual-owned SMLLC, federal 1040):
  the SE-taxed-income deduction (2024: $85,719 on Schedule J line 20)
  makes the EXCISE base negative, 2024 closed at -$28,912, which also
  carries forward. So excise is $0; only FRANCHISE tax bites: 0.25% of
  net worth ($78,000 in 2024 = $195). NEVER estimate F&E as 6.5% of net
  for this entity.
  Open items: 2025 FAE170 is NOT FILED (due 2026-04-15; $15 penalty
  already assessed). 2025 excise $0 via loss carryover; franchise needs
  the 12/31/2025 net worth figure. Account balance $302.95 total
  ($287.95 on 2024 + $15.00 on 2025), owner should pay.
- TNTAP hygiene: the LLC has NO mailing address on file (Action Center
  alert), add one so notices arrive. 82 unread messages + letters exist;
  only sales-tax assessments found in the last 12 months.
- Sales tax: account 1002589753-SLC, Jun-2026 return processed on time.
  Balance due $30.33 as of 2026-07-30 = leftover late penalties + interest
  from the Feb/Mar 2026 migration months (letters L0931820480 etc.; tax
  itself was paid). Owner should pay it off in TNTAP.

## Sources

- Jane exports: ~/Downloads/jane-sales-full-2024-01-01_to_2026-06-24.csv
  (2025: Bearden $378,469.61, Farragut $31,711.80, ex-tax invoiced).
- Bank P&L (reports DB business_pnl_monthly) starts 2025-07; Jul-Dec 2025
  = $248,856. Not usable alone for full-year filings.

## How to file and pay TN taxes (TNTAP)

Portal: https://tntap.tn.gov/eservices. Login `sahitchcox` (password in
owner's head, NOT in 1Password; the 1Password item `zwhitchcox` is a
deleted profile, update it). The password typed at submission acts as the
signature.

Rules that bite:

1. ONE TNTAP tab per browser. A second tab kills BOTH sessions
   ("duplicated a browser tab"). Close every other TNTAP tab first.
2. Two customers exist. Use SARAH HITCHCOX AESTHETICS, **LLC**
   (EIN **-***1443, 5113 Kingston Pike). The SSN-based customer
   (***-**-8840, Noelton Dr) is the old messed-up one; do not file there.

### Business tax return (annual, due April 15 for the prior calendar year)

1. LLC customer > Business Tax account 1002412947-BUS > View/File Returns.
2. Gross sales: yes. CSV upload: no.
3. Click the location (Bearden 1001711721). Primary activity: Retailer.
   Class 3, Knox County + Knoxville, 0.1875% each.
4. Line 1 gross sales EXCLUDING sales tax, per location, calendar year.
   Source: Jane/Boulevard invoiced subtotals for that location. 2025 was
   $378,469.61 (Bearden).
5. Deductions: none apply to us. Personal property tax credit: only if a
   Knox County/Knoxville personalty tax bill was actually paid that year
   (check Schedule C line 23; empty = answer No).
6. If late: penalty 5% per 30-day period (max 25%, min $15) + interest
   (~12.5%/yr, rate resets; TNTAP shows the current rate in its notices).
   Enter both on the Return Summary.
7. Submit (password = signature), pay by bank draft on the next screen,
   record the confirmation number here.

### Recurring calendar

| Tax | Due | Where |
| --- | --- | --- |
| Sales & use | monthly, 20th of following month | TNTAP, SLC account (auto-scheduled?) |
| Business tax | Apr 15 | TNTAP, BUS account |
| Franchise & excise | Apr 15 (+ quarterly estimates once liability > $5k) | TNTAP, no account yet, see CPA item |
| Federal 1040 w/ Schedule C | Apr 15 | TurboTax/CPA |
| Knox County minimal activity license (Farragut) | annual | Knox County Clerk, ~$15 |

### Projection accounting

The reports pipeline accrues taxes monthly in
`app/utils/finance-reports.server.ts` (view `household_profit_monthly`):
federal 30% of positive business net, TN business 0.375% of gross revenue,
TN excise 6.5% of positive net. Shown on /admin/reports/household-profit
and /admin/reports/profit-outlook.
