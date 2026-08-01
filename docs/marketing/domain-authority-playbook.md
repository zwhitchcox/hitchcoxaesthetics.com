# Domain Authority Playbook: Buying Expired Domains and Rebuilding Them

How we find expired/expiring domains with real backlinks, vet them,
buy them (owner only), rebuild them as honest static replicas, and
serve them from our own infrastructure with links to
hitchcoxaesthetics.com. Replaces the retired `domain-authority` skill
(2026-08-01); this doc is the source of truth.

Related: `knoxville-competitor-backlinks-2026-07-28.md` (ledger of
hunts and buys), `organic-backlinks.md` (editorial links),
`docs/listings/playbook.md` (citations).

## Why this works, and its limits

An expired domain keeps its inbound links. If the links are real, a
rebuilt site on that domain inherits authority we can pass to the main
site through honest links, or later through a 301. Limits:

- Google discounts expired-domain redirects and same-owner networks.
  Treat bought authority as an accelerant, not a teleporter.
- The value is only as real as the CLEAN linking domains. Composite
  scores and raw link counts lie (see case studies).
- Never fake continuity: a rebuilt site must say plainly who runs it
  now. Fresh content only, never the old site's copy.

## 1. Finding domains

Tool: Register Compass (member.registercompass.com, Zane's login, use
the Claude Code Browser pane). Sees about ONE WEEK of supply:
expiring = drops within 5 days, auctions = minutes to 8 days out,
expired = recently dropped and free to hand-register. Run WEEKLY.

Sweeps (saved in RC search history; click to reload):

1. Local: name contains `knoxville;farragut;bearden;easttennessee`
   (widen with `tennessee;knox` when thin)
2. Topical: `aesthetic;botox;medspa;medicalspa;laserhair;laserclinic;weightloss;skinclinic;skincare`
   (widen with `dermatology;cosmetic;injectables;antiaging;facials`)

Filters: TLD com/net/org, no hyphens, no digits, Internet Archive
snapshots > 1, Age (WB) before ~4 years ago, Majestic Linking
Domains > 20 (drop to 10-15 when widening).

Results are direct-navigable; URL shape (vt=PD expiring, EX expired,
AUC auction):

```
/member/detailview/DetailView.aspx?vt=EX&c=1&f=,1*10*!TERM!.!,...,1*4*!-!,1*4*![0-9]!,1*3*[com|net|org|],23*2*1,22*0*2021,38*2*20
```

Read Majestic linking DOMAINS and Trust Flow. Ignore raw link counts
and composite authority scores.

### Automated daily hunt (built 2026-08-01)

`sha-reports/src/domain-hunt.ts` runs the whole of steps 1 and 2 daily
and emails only when something survives. Failures always email.

- **Runs on the Mac mini** (needs a logged-in Register Compass browser
  profile; RC has no API and a captcha on login).
- **Ledger**: SQLite at `~/.domain-hunt/ledger.db`, tables `seen` and
  `runs`. Every domain ever judged is stored with its verdict, so it is
  never paid for twice. Re-vetted only if its linking domains grow 50%.
  Seeded 2026-08-01 with the 19 domains judged that day (5 buys, 14
  rejects).
- **Cost ladder**: RC scrape free, ledger dedupe free, Wayback free,
  DataForSEO only for survivors (~$0.027 each), LLM verdict only after
  the hard rules pass.
- **Real measured cost**: the first run drains the whole backlog. On
  2026-08-01 it scanned 155 rows, vetted 122 new domains and spent
  $3.31. Steady state is only genuinely-new domains, so expect roughly
  $0.20 to $0.80 a day, not the $0.10 first guessed. `HUNT_MAX_SPEND`
  (default $2.00) hard-caps a run; anything past it keeps its ledger
  slot and is vetted the next day.
- **Status page**: http://Zanes-Mac-mini.local:8788 (own launch agent,
  `com.hitchcox.hunt-status`, separate from worker-manager on 8787).
  Flagged domains with authority, referring domains, clean count, PBN
  risk, price and deadline; click through for the top 25 backlinks by
  authority and the anchor mix.
- **Hard rejects before any spend**: spam anchor patterns (slot, casino,
  judi, togel, deposit pulsa, pharma, adult), known mass-spam linkers
  (drjack.world, bye.fyi, urls-shortener.eu, the AU link-farm cluster),
  no Wayback history, fewer than 15 real linking domains.
- **Email**: digest of BUY/WATCH rows with price, auction deadline, and
  reasoning. Silent when nothing survives.

Setup and operation:

```
cd ~/dev/zwhitchcox/sha/sha-reports
pnpm install && npx playwright install chromium
npx tsx src/domain-hunt.ts --login     # log in once, in Playwright's own profile
cp bin/com.hitchcox.domain-hunt.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.hitchcox.domain-hunt.plist
```

Runs 7:20am daily. Manual run: `bin/domain-hunt.sh` (add `--dry-run` to
skip email). Logs at `/tmp/domain-hunt.log`.

IMPORTANT: the login must happen through `--login`, which opens
Playwright's own profile. Logging in with regular Chrome does not carry
over. When the session expires the job emails "Register Compass login
needed" and stops until someone runs `--login` again.

Gotchas found while building it, all fixed, all worth knowing:

- The site `.env` declares `RESEND_API_KEY` twice and the last value is
  a mock dev key, so naive sourcing yields a key that 401s.
  `bin/domain-hunt.sh` picks the first non-mock key. Remove that
  workaround if the .env is ever cleaned up.
- launchd does not inherit the Homebrew PATH, so `npx` was not found and
  BOTH agents would have failed silently. Each plist now sets PATH
  explicitly.
- The RC DetailView URL bounces back to the search form unless the
  session already has an active search, so the job loads
  DomainSearch.aspx first.
- RC data rows carry extra leading cells the header row lacks, so header
  index does not equal cell index. The parser locates the domain cell by
  pattern and shifts every other column by that offset.
- Playwright does not auto-invoke a bare function string, and tsx
  compiles closures with a `__name` helper that does not exist in page
  context. The parser is passed as an IIFE string with values baked in.
- OpenRouter model `anthropic/claude-3.5-haiku` 404s (no endpoints),
  which silently produced empty verdicts. Use
  `anthropic/claude-haiku-4.5`. Judgment failures now surface the API
  error text instead of an empty reason.

## 2. Vetting (all three steps, BEFORE recommending a buy)

1. **Wayback history.** CDX yearly snapshots (try bare and www):
   `http://web.archive.org/cdx/search/cdx?url=DOMAIN&output=json&fl=timestamp,statuscode&collapse=timestamp:4`
   Fetch 2+ snapshot pages (mid-life and last live year); scan for
   CJK text and casino/pharma/adult words. Any spam era kills the
   clean tier. NO history at all = unverifiable = unbuyable.
2. **Anchor audit (the step that catches what everything else
   misses).** DataForSEO `backlinks/backlinks/live`, mode as_is,
   limit 400+, creds in `sha-reports/.env`, ~$0.05/domain. Read the
   ANCHOR texts and linker domains:
   - Gambling/pharma anchors ("albaslot", "deposit pulsa", casino
     terms) = the domain is or was a spam target. Kill.
   - SEO-service anchors, or the known mass-spam linkers that link
     everything (drjack.world, bye.fyi, urls-shortener.eu, the
     dayofdifference.org.au cluster) = the domain count is ghosts.
   - Press-release syndication networks (lifestyle.* mirrors) = one
     real link duplicated; count it once.
3. **Deep-link map.** From the same pull, record every `url_to` path
   and hotlinked image path with counts. This is the replica
   blueprint (step 4) and also reveals repurposed-spam eras (a music
   blog with a /cbd-oil-infection path was repurposed).

Deliver a ranked table: domain, buy route/price/deadline, clean
linking domains, TF, what it really was, verdict, recommended play.
Log it in the ledger doc. Owner buys; Claude never touches payment.

## 3. Buying guide (owner)

- Expired/dropped: hand-register anywhere, ~$12.
- GoDaddy auctions/closeouts: bid early on $1 opens; buy-now when
  cheap and clean.
- Snap/DynaDot/prerelease: usually $69+; needs a stronger profile to
  justify.
- Budget rule of thumb: a clean domain with 100+ real linking domains
  is worth $50-200. Anything with spam anchors is worth $0 at any
  price.

## 4. Rebuilding as a replica (proven 2026-08-01)

Scaffold: copy `~/dev/zwhitchcox/sha/botoxknoxvilletn.com`, strip
booking/analytics/API keys, keep the packageManager pnpm pin.

Rules:

- `output: 'static'` in astro.config, no node adapter, no
  src/pages/api. Static output builds to `dist/` (dist/client exists
  only in server mode). VERIFY every page is present in the bundle
  before shipping; non-prerendered pages vanish silently.
- Fresh original content on the old site's THEME (skincare site stays
  a skincare site). Never copy old content, never impersonate the old
  business. About page states the old site/business is gone and the
  domain is maintained by Sarah Hitchcox Aesthetics, nurse-run,
  Knoxville TN, Bearden and Farragut (Bearden first).
- **Replicate the linked paths.** Every deep path from the url_to map
  gets a real page at the EXACT old path. Hotlinked images get real
  image files at the EXACT old file paths (wikiHow-style hotlinks
  keep resolving). This is where much of the equity lives.
- Every article: "Medically reviewed by Sarah Hitchcox, RN, BSN"
  linking https://hitchcoxaesthetics.com. Footer: "Maintained by
  Sarah Hitchcox Aesthetics, Knoxville TN" linking the homepage.
- ONE contextual keyword anchor per article to the homepage, varied
  ("Knoxville med spa", "Botox in Knoxville", "laser hair removal in
  Knoxville", "medical weight loss in Knoxville"). Never more than
  one per page. Footer stays brand-anchored.
- 404 links home. Sitemap. No noindex. No em dashes anywhere.

## 5. Serving (one server, no new apps)

- Copy the static bundle to
  `hitchcoxaesthetics.com/network-sites/<domain>/`.
- Add the host to `NETWORK_SITES` in `server/index.ts` (vhost
  middleware, placed before the trailing-slash redirect).
- Gates (tsc, oxlint 0 errors, TZ=America/New_York vitest), push
  master, CI deploys.
- `flyctl certs add <domain> -a hitchcoxaesthetics-com-51cc` plus www.
- Verify: `curl https://hitchcoxaesthetics-com-51cc.fly.dev/ -H "Host: <domain>"`
- DNS (owner): A 66.241.124.89, AAAA 2a09:8280:1::36:c5e1:0, www
  CNAME hitchcoxaesthetics-com-51cc.fly.dev. Prefer Cloudflare
  proxied so the shared origin is not visible; add the
  `_acme-challenge` CNAME unproxied for cert issuance.
- Destroy any standalone Fly app for the domain.

## 6. Afterward

- 4-6 weeks after go-live, decide per domain: stay a network site or
  301 into the best-matching service page. ONLY clean-profile domains
  may ever be 301'd into the main site. Tracked in Hitchcox Linear
  (key LINEAR_HITCHCOX_API_KEY in ~/.zshrc); see SHA-19.
- Add live domains to sha-reports backlinks TARGETS so the crawl
  tracker watches their links.
- Expect DA movement only from clean profiles, weeks after Google
  recrawls. Network-site links alone move our DR a point or three;
  301s of clean domains are the bigger lever.

## Case studies (2026-08-01, keep these; they are the training data)

| Domain | What the metrics said | What vetting found | Lesson |
| --- | --- | --- | --- |
| smileyaesthetics.com (competitor) | Authority 454 | 67k links are its own booking app cross-linking | Composite scores are gameable; read linking domains |
| abellamedspa.com (bought $40) | 105 domains, clean Wayback | Anchor audit post-purchase: scraped directories + AU PBN cluster | Anchor audit BEFORE buying; PBN profile = never 301 |
| knoxmusictoday.com | 726 domains! | No Wayback at all; anchors "deposit pulsa" Indonesian gambling | Huge counts + no history = PBN target; rebuilding pages cannot fix inbound anchors |
| copperhilltennessee.com | Clean town site 2004-2024 | 386 of 400 live anchors are "albaslot" | Wayback alone is not enough; always read anchors |
| knoxpr.com | 82 domains, clean anchors | Linkers are one PR-syndication network + mass-spam sites | Deduplicate syndication before valuing |
| naturalskincarerecipes.com | 164 domains | Real 2005-2024 content site; bustle.com dofollow; wikiHow image hotlinks | The good ones exist; deep paths and images carry the equity |
| mesolaserclinic.com (bought ~$12) | 136 domains, TF 19 | Real clinic 2007-2015, YP/Superpages/DexKnows citations | Clean + topical = the ideal profile; 301 candidate |
