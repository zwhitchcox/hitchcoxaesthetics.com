# Content & Linking Rules

when committing/pushing, make sure to check the linter/tsc

## Dev Server Rule

- Never start, restart, stop, or detach the dev server unless the user
  explicitly asks for it first. If work requires the dev server to be started or
  restarted, ask the user to do it or ask for permission before taking action.

## Content Strategy

- **Keywords:** Integrate "Knoxville" keywords naturally. Do not stuff.
- **Variations:** Use diverse phrasing:
  - "Botox in Knoxville"
  - "Botox Knoxville"
  - "Knoxville Botox"
  - "Botox in Knoxville, TN"
  - "Knoxville, TN Botox"
- **Headings:** H2 headers (markdown `##`) must include the service name and
  location (e.g., "## Lip Filler Results in Knoxville"). Keep them concise.
- **H1:** Handled by the hero component. Do NOT include H1 (`#`) in markdown
  body.
- **Distribution:** Spread keywords and links throughout the content, not
  bunched at the beginning or end.

## Linking Hierarchy

Strict hierarchy rules to prevent circular logic and maintain silo structure:

1. **Category Pages** (e.g., `/injectables`, `/laser-services`)
   - **Can link to:** Sibling categories (e.g., `/microneedling`,
     `/weight-loss`)
   - **Cannot link to:** Sub-services or children in body text (e.g.,
     `/botox/forehead-lines`). Use the automated card grid for child navigation.

2. **Mid-Level Pages** (e.g., `/botox`, `/everesse`)
   - **Must link to:** Parent category (e.g., `/injectables`)
   - **Can link to:** Sibling mid-level pages (e.g., `/filler`, `/dysport`)
   - **Cannot link to:** Child leaf pages (e.g., `/botox/forehead-lines`) in
     body text.

3. **Leaf Pages** (e.g., `/botox/forehead-lines`, `/everesse/face`)
   - **Must link to:** Parent mid-level page (e.g., `/botox`)
   - **Can link to:** Sibling leaf pages (e.g., `/botox/crows-feet`)
   - **Cannot link to:** Non-sibling pages (e.g., `/filler/lip-filler` or
     `/microneedling/facial`)

## Anchor Text

- Use descriptive, keyword-rich anchor text.
- **Bad:** "Click here", "Learn more"
- **Good:** "Learn more about [Knoxville Botox treatments](/botox)", "Explore
  our [dermal filler options in Knoxville](/filler)" o npm install
  @typescript/native-preview

## Email Access (Gmail API, no browser needed)

Keychain-backed OAuth helpers exist on this machine for both business
inboxes. Use these instead of driving Gmail through a browser:

- `~/.local/bin/google-business-token` prints an access token for
  `sarah@hitchcoxaesthetics.com` (scopes: gmail.modify, calendar,
  contacts, drive, tasks). Use it to read outreach replies and send
  mail from Sarah's address through the Gmail API.
- `~/.local/bin/google-personal-token` does the same for
  `zwhitchcox@gmail.com`.
- `--refresh-token` on either prints the refresh token. Secrets live in
  the macOS Keychain; nothing to source or copy into .env.
- The separate `GOOGLE_REFRESH_TOKEN` in this repo's `.env` is
  `zwhitchcox@gmail.com` with GBP/Ads/Search Console scopes only, no
  Gmail. It is also `siteOwner` on all three Search Console properties,
  so Search Analytics API calls need no new consent.

Log every outreach email in `docs/marketing/organic-backlinks.md` or
the Knoxville ledger, and check those ledgers before emailing anyone.

## Domain Authority Playbook

Finding expired domains, vetting them (Wayback + mandatory anchor
audit), rebuilding them as honest static replicas, and serving them
from this server: follow
`docs/marketing/domain-authority-playbook.md`. The ledger of hunts
and buys is `docs/marketing/knoxville-competitor-backlinks-2026-07-28.md`.
