# Boulevard Revenue Attribution

This repo now has a Boulevard-native attribution ledger for connecting custom
`/book` conversions to downstream revenue.

## What Happens Today

On successful checkout in `app/routes/book.tsx`:

1. `booking_completed` still fires to PostHog.
2. The browser POSTs a normalized payload to `/resources/blvd-attribution`.
3. The server persists:
   - `BlvdClient`
   - `BlvdAttributionTouch`
   - `BlvdAttributedAppointment`

The crucial identity is the Boulevard `clientId` returned by checkout for each
booked appointment.

## Data Model

### `BlvdClient`

Canonical Boulevard client identity used for attribution joins.

### `BlvdAttributionTouch`

A single attributable touch, currently created from a successful web booking.

Key rule:

- A later attributable touch should supersede an earlier one for future revenue.

### `BlvdAttributedAppointment`

Maps booked Boulevard appointment IDs back to the touch that created them.

### `BlvdRevenueItem`

Normalized downstream revenue record, intended to be populated from Boulevard
sales/invoice/payment data.

When a revenue item is inserted or reconciled, attribution is assigned using:

- latest touch for the same Boulevard client where
  `touch.occurredAt <= revenue.occurredAt`

That is the `last_touch_before_revenue` rule.

## Scripts

Import normalized revenue JSON:

```bash
pnpm blvd:import-revenue --input path/to/blvd-revenue.json
```

Recompute attribution after backfills or touch changes:

```bash
pnpm blvd:reconcile-revenue
```

## Revenue JSON Shape

The import script expects an array matching this normalized shape:

```json
[
	{
		"externalId": "sale_123:line_1",
		"boulevardClientId": "client_123",
		"boulevardAppointmentId": "appointment_456",
		"boulevardInvoiceId": "invoice_789",
		"boulevardPaymentId": "payment_321",
		"boulevardSaleId": "sale_123",
		"occurredAt": "2026-04-11T16:00:00.000Z",
		"itemName": "Botox",
		"itemType": "service",
		"serviceCategory": "botox",
		"grossAmountUsd": 236,
		"netAmountUsd": 236,
		"discountAmountUsd": 0,
		"gratuityAmountUsd": 0,
		"currency": "USD",
		"rawPayload": {}
	}
]
```

## What Still Needs Boulevard API/Export Wiring

The attribution ledger is in place, but the revenue feed still needs a Boulevard
source.

Any of these can feed `BlvdRevenueItem`:

1. Boulevard API sync script
2. Boulevard webhook receiver
3. Boulevard export transformed into the normalized JSON shape above

## PostHog DW Fit

Once `BlvdRevenueItem` is populated, PostHog DW becomes useful for:

- source to revenue reporting
- LP vs non-LP revenue comparisons
- repeat revenue by source
- 30/60/90 day revenue after booking

But the source of truth for attribution should stay in the app database, with
PostHog used for analysis on top of it.
