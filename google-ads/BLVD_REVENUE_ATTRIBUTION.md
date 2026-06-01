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

If the browser session has PostHog identity available at booking time, the touch
also stores:

- `posthogDistinctId`
- `posthogSessionId`

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

When a revenue item is inserted or reconciled, the server also emits a PostHog
event:

- `blvd_revenue_recorded`

That event includes the resolved attribution properties directly on the revenue
row, so PostHog can break revenue down by `traffic_source_detail`, LP vs non-LP,
service category, and related booking properties without needing to re-infer the
relationship later.

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

## Live Boulevard Revenue Sync

Closed Boulevard orders can now be imported directly from the Boulevard Admin
API. The sync walks each Boulevard location, reads recently closed orders,
normalizes each order line into `BlvdRevenueItem`, and lets the database
attribution rule connect that real revenue to the most recent booking touch for
the same Boulevard client.

Dry run:

```bash
pnpm blvd:sync-revenue -- --days=7 --limit=25
```

Apply:

```bash
pnpm blvd:sync-revenue:apply -- --days=7
```

Production also runs `Boulevard Real Revenue Sync` as a background job. It is
visible in `/admin/bg`.

The sync updates two destinations from the database:

- PostHog receives `blvd_revenue_recorded` from `upsertBlvdRevenueItem`.
- CallRail receives the aggregate actual revenue for each attributed call, using
  the stored `BlvdAttributionTouch -> revenueItems` relationship.

This means projected booking value can be replaced by actual spend once the
appointment closes in Boulevard. If the client books another appointment after
the same touch, that later order is also attributed by the same
`last_touch_before_revenue` rule unless a newer touch exists first.

## PostHog DW Fit

Once `BlvdRevenueItem` is populated, PostHog DW becomes useful for:

- source to revenue reporting
- LP vs non-LP revenue comparisons
- repeat revenue by source
- 30/60/90 day revenue after booking

But the source of truth for attribution should stay in the app database, with
PostHog used for analysis on top of it.
