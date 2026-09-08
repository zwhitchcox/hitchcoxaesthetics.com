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
2. Topical: `medspa;medicalspa;esthetic;botox;laserhair;laserclinic;weightloss;skinclinic;skincare;dermatology;cosmetic;injectables;antiaging;microneedling`
3. Services and brands: `filler;dermalfiller;lipfiller;juvederm;restylane;dysport;jeuveau;xeomin;sculptra;kybella;semaglutide;tirzepatide;hydrafacial;coolsculpting;bodysculpting;facial;dayspa;wellnesscenter`

Include every service the practice sells. A term that is missing is a
domain we will never see, and brand names matter as much as generic ones
because old clinic sites are usually named after what they injected.

RC matches SUBSTRINGS, so choose the shortest stem that covers the
variants: `esthetic` catches aesthetic, aesthetics, esthetics,
esthetician and aesthetician in one term, while `aesthetic` alone would
miss every American spelling. Likewise `facial` covers facials, and
`filler` covers fillers.

Broad stems pull real noise (`filler` also matches anime lists,
refilleries and packaging suppliers), so the automated job runs ONE
batched LLM name screen before any paid lookup. Measured 2026-08-01: 13
names screened for $0.0014, correctly dropping the 5 that would have
cost $0.135 to check.

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
| agelessyoumedspa.com (bought $52) | 1 "strong dofollow" appraised $450 | The $450 link (provenexpert.com DA 70) is an unclaimed review-platform PROFILE; real value is the ryerecord.com editorial + citation cluster | Review platforms (provenexpert, trustpilot) are listings, not editorial; classifier fixed 2026-08-04. The machine only classifies page TYPE mechanically and links every strong link to its live page; ZANE eyeballs the page and makes the value call before bidding. Never let the model discount a link for being "negative" or unusual — the fda.gov health-fraud link looked toxic and became our best asset |

## Reclaiming links on domains we own (added 2026-08-02)

An expired domain's editorial links point at POST URLs, not the homepage.
Those posts are gone, so without work every one of them 404s and passes
nothing. The fix has three parts, and all three matter.

### 1. Never republish the previous owner's content

The domain transfers the name, never the writing. Pulling the old posts
out of the Wayback Machine and reposting them is copyright infringement
and contradicts the provenance notice each site carries. Write original
articles on the same subject instead.

### 2. Find the URLs that actually have links

`domain_links` in the hunt ledger stores the LINKING page, not the
target. Pull the target with DataForSEO `backlinks/backlinks/live` and
read `url_to`, then group by target URL and sort by best linker rank.
About $0.03 per domain. Anything without a real dofollow linker is not
worth building a page for.

### 3. Match the URL, then redirect the rest

Two ways to catch a legacy URL, in order of preference:

- **Serve the article at that exact path.** Best option: no redirect
  hop, no dilution. naturalskincarerecipes.com already did this for
  /coconut-oil-for-acne/ and /microdermabrasion-at-home-using-natural-remedies/,
  so those links have been landing on real content all along.
- **301 to the closest article.** Used where the old URL is dated or
  language-specific (a 2013 Blogger path, a /wp-content/ upload). The
  map lives in `LEGACY_REDIRECTS` in server/index.ts with the linking
  domain noted in a comment so it can be re-verified.

Expect partial value from a redirect: a specific product review pointing
at a general guide is a topical near-miss, not a match. It still beats a
404, which passes nothing at all.

### 4. Every article links back, one way only

Each rebuilt article carries a link to hitchcoxaesthetics.com in the
byline or body. The network sites never link to each other, and
hitchcoxaesthetics.com never links back out to them, so the shape stays
one-directional rather than a ring.

### Status as of 2026-08-02

| Domain | Best inbound | Target handled |
|---|---|---|
| naturalskincarerecipes.com | bustle.com DA 59 | DROPPED 2026-08-03: we never owned it (registered continuously since 2012, renewed by its owner 2026-07-05 at Internet.bs). Hunt later confirmed it is sold as PBN inventory ("High Quality Dofollow Backlinks DA 50 PA 40 Premium PBN Network" anchors). Not buying; articles removed from network-sites; Bustle link does NOT count in DA projections |
| cosmeticcrave.com | buzzfeed DA 61, cosmopolitan DA 52 | both 301 to new guides |
| agelessyoumedspa.com (bought $52, 2026-08-04) | ryerecord.com editorial ("photofacials in Merritt Island, FL" -> /photofacials/) + ~20 clean citations; provenexpert DA 70 turned out to be a review-platform PROFILE, not editorial | Rebuilt as AgelessYou Guide (/, /neuromodulators/, /photofacials/, /botox-treatment/, about, privacy). Deployed; CF zone + Fly certs staged. BLOCKED on GoDaddy nameservers -> coby/melinda.ns.cloudflare.com |
| testandoprodutoscosmeticos.com | areademulher.r7.com DA 55 | 301 to /artigos/ |
| temanaskincare.com | nzherald.co.nz DA 53 | site NOT BUILT yet; link hits the homepage |
| safecosmeticsalliance.org | howstuffworks DA 51 | 301 to /blog/a-brief-history-of-cosmetics (2026-08-03; was served on-site, but that kept the equity one hop away) |
| xceleratedweightloss.com | fda.gov DA 93 x3 (health-fraud notifications for Charged Up / Turbo Charge / Ultra Max, all dofollow, all to the homepage) | REVISED 2026-08-04 (Zane's call, accepts the expired-domain-abuse pattern risk): homepage 301s to /blog/xcelerated-weight-loss-fda-warning on our site; the warning content lives there now. Deeper pages still serve on-domain. Watch GSC + weekly geo grid after Google recrawls the FDA pages; roll back the 301 if rankings turn red. Was: rebuild-only warning site (2026-08-03) |

Open item: temanaskincare.com is registered but has no site, and its NZ
Herald link currently resolves to nothing.

## Deploying a network site so it actually resolves (added 2026-08-02)

A Fly deploy alone does NOT make a network domain reachable. Serving the
files is step one of four. Skipping any of the rest leaves the domain
dead (SSL 525, or a parked page). Verify each over PUBLIC HTTPS, not just
with a Host header against the fly.dev URL.

### The four DNS/cert records every proxied domain needs

Traffic runs through Cloudflare's proxy, so Fly cannot see the origin's
own cert and must verify ownership another way. Copy the pattern from a
WORKING zone (antiagingpress.org) rather than guessing. For domain X:

1. `A    X                → 66.241.124.89`   proxied
2. `A    www.X            → 66.241.124.89`   proxied
3. `AAAA X                → 2a09:8280:1::36:c5e1:0`  proxied  (REQUIRED)
4. `AAAA www.X            → 2a09:8280:1::36:c5e1:0`  proxied
5. `TXT  _fly-ownership.X       → app-wz1pm2`   (REQUIRED, dns-only)
6. `TXT  _fly-ownership.www.X   → app-wz1pm2`

The AAAA and the two _fly-ownership TXT records are the ones easy to
miss. Without them the cert stays "Not verified" and the domain returns
Cloudflare error 525 (SSL handshake failed). Fly's exact values come
from `flyctl certs setup X`.

### Then

7. Add the host to `NETWORK_SITES` in server/index.ts and deploy.
8. `flyctl certs add X` and `flyctl certs add www.X`.
9. Switch the REGISTRAR nameservers to Cloudflare (coby/melinda) if the
   domain is not already on Cloudflare. A domain still on GoDaddy or a
   parking host (e.g. ns1.ibspark.com) will never resolve to us no
   matter what the Cloudflare zone says.

### Verify, do not assume

`flyctl certs show X` must read `Status = Issued`. Then:

    curl -sI https://X/            # expect 200
    curl -s https://X/ | grep hitchcoxaesthetics.com   # link out present

"Certs staged" or "deployed" is NOT "live". Only a 200 over public HTTPS
counts. Lesson from 2026-08-02: a deploy was called done while three
domains returned 525 because the AAAA/ownership records were missing.

### Article content standard

Network-site articles get the same treatment as our own pages: a hero
image (generated via OpenRouter image models, compressed to ~40KB with
ffmpeg), descriptive alt text, an internal "Related guides" block,
Article + BreadcrumbList JSON-LD schema, og:image, and one dofollow link
to hitchcoxaesthetics.com. Text-only articles are not finished articles.

## Where each expired-domain link should point (policy, 2026-08-03)

Two options per URL, and the choice depends only on how big the link is.

### Tier 1: roughly DA 50 and above -> 301 to hitchcoxaesthetics.com/blog

Redirect the dead post URL straight to the matching blog article on the
main site. Direct, no one-hop dilution. Requires that a topically
matching article EXISTS first, because the whole risk of a cross-domain
301 is topic mismatch. Redirecting a hand-cream review to a med-spa
homepage reads as a soft 404; redirecting it to an article about hand
care does not.

Currently tier 1:

| Dead URL | Link | Goes to |
|---|---|---|
| cosmeticcrave.com/2013/03/review-soap-and-glory-hand-food.html | buzzfeed.com DA 61 | /blog/hand-cream-and-hand-aging |
| cosmeticcrave.com/2013/08/monthly-favourites-july.html | cosmopolitan.com DA 52 | /blog/how-to-read-a-skincare-label |
| safecosmeticsalliance.org/index.cfm?objectid=EE203500-... | lifestyle.howstuffworks.com DA 51 | /blog/a-brief-history-of-cosmetics |

### Tier 2: below roughly DA 50 -> keep the article, link out normally

The article stays on the network site and carries one dofollow link to
hitchcoxaesthetics.com. A cross-domain 301 costs some equity to an
ownership + topic change, and that cost is only worth paying on a link
big enough to matter. Below the threshold, the safer one-hop structure
wins.

### Language exception

Keep visitors in their own language. The r7.com link (DA 55) to
testandoprodutoscosmeticos.com is Portuguese and stays on the Portuguese
site, even though it clears the DA threshold, because sending a
Portuguese reader to an English med-spa page is a bad landing whatever
Google thinks of it.

## Measuring whether the 301s actually pass value

This is testable, not a matter of opinion, and the instrument already
exists.

`backlink_domains` in the reports DB stores one row per referring domain
per target, with first_seen and last_seen. It is populated by
sha-reports/src/backlinks.ts.

**The test:** if Google honours a cross-domain 301, the ORIGINAL linking
domain eventually shows up as a referring domain to the REDIRECT TARGET.
So watch for these rows appearing with target = hitchcoxaesthetics.com:

    select domain, first_seen, rank from backlink_domains
    where target = 'hitchcoxaesthetics.com'
      and domain in ('buzzfeed.com','cosmopolitan.com','bustle.com',
                     'howstuffworks.com');

- Rows appear within roughly 2-3 months: the redirect passed. Extend the
  tier 1 policy to more URLs.
- Nothing after 3-4 months: the redirect is being discounted. Revert
  those URLs to tier 2 (article on the network site, link out) and take
  the one-hop version instead.

Two supporting signals, neither as clean:

- Google Search Console for hitchcoxaesthetics.com, Links > External
  links. Same signal, straight from Google.
- Rankings for the target keywords over the same window, from the
  existing geo-rank tracking. Slower and noisier because many things
  move rank at once.

Record the decision either way in this document, with the date, so the
next domain purchase inherits a tested rule instead of a guess.
