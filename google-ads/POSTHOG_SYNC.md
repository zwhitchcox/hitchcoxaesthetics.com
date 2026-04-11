# PostHog Sync

This repo now includes a declarative PostHog sync script for dashboards and
saved insights.

## Files

- `scripts/posthog-sync.ts`
- `google-ads/posthog-booking-attribution.yaml`

## What It Does

The script:

- loads a YAML config
- creates or updates dashboards by name
- creates or updates saved insights by name
- attaches configured insights to the configured dashboard
- can remove old managed insights from a dashboard when they are no longer in
  the YAML
- can prune dashboards and insights across the project when the YAML enables it

It is designed so PostHog setup is not trapped in manual UI steps.

## Required Env Vars

- `POSTHOG_PERSONAL_API_KEY`

Optional:

- `POSTHOG_APP_HOST`

If `POSTHOG_APP_HOST` is not set, the script will infer the private API host
from `REACT_APP_PUBLIC_POSTHOG_HOST`.

## Commands

Dry run:

```bash
pnpm posthog:sync
```

Apply changes:

```bash
pnpm posthog:sync:apply
```

Use a different config file:

```bash
tsx scripts/posthog-sync.ts --config path/to/dashboard.yaml --apply
```

## YAML Shape

```yaml
posthog:
  project_id: 72891

project_sync:
  prune_unconfigured_dashboards: true
  prune_unconfigured_insights: true

defaults:
  date_range:
    date_from: -30d
  breakdown_limit: 25
  insight_tags:
    - booking

dashboards:
  - name: Booking Funnel - Attribution
    managed_tag: managed:booking-funnel-attribution
    sync_mode: replace_managed
    insights:
      - kind: funnel
        name: Entry To Completion - Source Detail
        breakdown: traffic_source_detail
        steps:
          - event: booking_funnel_entered
          - event: booking_completed
```

## Supported Insight Types

### Funnel

Fields:

- `kind: funnel`
- `name`
- `description`
- `breakdown`
- `breakdown_limit`
- `properties`
- `date_range`
- `steps`

Each step supports:

- `event`
- `name`
- `custom_name`
- `properties`

### Trend

Fields:

- `kind: trend`
- `name`
- `description`
- `breakdown`
- `breakdown_limit`
- `properties`
- `date_range`
- `interval`
- `series`

Each trend series supports:

- `event`
- `name`
- `custom_name`
- `properties`
- `math`
- `math_property`
- `math_property_type`

## Dashboard Sync Behavior

Recommended mode:

- `sync_mode: replace_managed`

This uses `managed_tag` to treat the YAML as the source of truth for that
dashboard. If a managed insight is removed from the YAML, the script removes it
from the dashboard on the next sync.

If you want the script to only add/update insights without removing old ones,
use:

```yaml
sync_mode: append
```

## Project Pruning

If you want the PostHog project to match the YAML exactly, enable:

```yaml
project_sync:
  prune_unconfigured_dashboards: true
  prune_unconfigured_insights: true
```

This is destructive. Any dashboard or saved insight not declared in the YAML is
marked deleted on apply.

## Query Filters

Insights can add top-level query filters with `properties`.

Example:

```yaml
- kind: funnel
  name: Entry To Completion - LP Entry by Source Detail
  breakdown: traffic_source_detail
  properties:
    - key: book_entry_from_path
      type: event
      value: ^/lp(?:/|$)
      operator: regex
```

## YAML Tips

Use YAML anchors for repeated step lists. The booking config does this for:

- the 2-step entry-to-completion funnel
- the full booking step funnel

That keeps the config declarative without repeating the same step blocks over
and over.
