# GameTrackDaily

Public-facing games site for the current lineup, plus public-safe `Game Development`, curated `Review Coverage`, `Games News`, and `Release Calendar` surfaces.

This repo is set up as a static GitHub Pages site. It intentionally does not include the private local-launch controls from the desktop hub. Instead, it acts as the public layer where game pages, screenshots, demos, store links, shared craft guidance, aggregated news, and curated games data can grow over time.

`Games News` is split into four public rails:
- `Game Dev News`
- `Gaming News`
- `Games Reviews`
- `Games Previews`

Those `Reviews` and `Previews` rails are curated coverage from the wider games press. They are not intended to become a personal house-review publication.

The public shell now uses the Arcade design system and focused pages instead of cramming everything into one surface:
- `releases.html` for the Arcade release radar and platform-filtered schedule
- `games.html` for the full lineup
- `game-development.html` for public-safe craft/reference
- `news.html` as the news landing page
- `news-development.html`, `news-gaming.html`, `news-reviews.html`, and `news-previews.html` for the four feed rails
- `reviews.html` for review/previews coverage navigation
- `calendar.html` as a compatibility alias for the release radar
- `events.html` for conferences, showcases, awards, local times, and official watch links

The current launch shell is designed as an editorial watch desk rather than a repo index:
- a stronger homepage built around launch radar, labelled provisional data, and featured public candidates
- a cleaner masthead and page framing across the whole public shell
- more deliberate separation between lineup, coverage, releases, and events
- a shared footer across every route with GameTrackDaily links, project links, contact/source links, and Elusion Works as the umbrella home

`Release Calendar` now stays focused on Windows PC, Xbox, and PlayStation release tracking, while `Events` handles conferences, showcases, and awards with local-time drill-downs and official watch destinations.

That news layer is filtered to `Windows PC`, `Xbox`, and `PlayStation`. Xbox and PlayStation coverage should use specific model or service tags such as `Xbox Series X`, `Xbox Series S`, `PlayStation 5`, `Xbox Game Pass`, or `PlayStation Plus` where the source supports that detail.

## Deployment and rollback rehearsal

Record the current known-good commit, successful branch Pages build and rehearsal evidence on the [launch issue](https://github.com/koltregaskes/rooms-os-hub/issues/1506), rather than keeping a dated baseline in this README.

This site publishes directly from main through the legacy branch Pages builder. The primary rollback path is a narrowly scoped revert PR on main: obtain Claude approval and green checks, merge it, wait for the branch Pages build, then verify the public HTTPS bytes against the intended revision. Restore the desired reviewed release through a further reviewed PR and repeat the build and destination checks.

Rerunning the Actions deployment workflow is not a rollback of this branch-published site. That method is not applicable unless the Pages source is explicitly changed to workflow publishing, which requires Kol's approval. Do not switch Pages sources, force-push main, alter DNS or restart a legacy writer as part of a rollback.

Keep fresh news/calendar data and source timestamps under the existing writer; revert only the faulty change rather than blindly restoring old data. Record build URLs, exact commits, public hashes, failures and recovery on the launch issue. Confirm the named operational owner and distinguish offline artifact restoration from a production rollback or data-recovery test.

## Public vs Private

- This repo is public-facing only.
- The private studio console stays in the separate local-only `local-hub/` workspace and is ignored here.
- Do not commit machine-local evidence, review captures, launch scripts, or internal planning notes.
- Keep this repo safe for GitHub Pages and public browsing.
- Treat `shared/game-development/`, `shared/game-reviews/`, and `data/` as public-safe shared content the private console may also consume.

## Local preview

```powershell
python -m http.server 8790
```

Then open `http://127.0.0.1:8790`.

## Guarded public-data staging

Current news and calendar generators must write to a staging directory outside
this public checkout. Inputs anywhere inside the checkout are rejected.
Reviewable public files are then prepared with:

```powershell
node scripts/stage-public-data.mjs `
  --news-input "<staging-dir>\games-news.json" `
  --calendar-input "<staging-dir>\release-calendar.json" `
  --output-dir data
```

That command is a dry run. It rejects stale, empty, example-marked or
machine-local data, then reports the exact resolved input paths, source hashes,
ages, item counts and intended public outputs. Add `--write` only after the
dry-run evidence has been reviewed:

```powershell
node scripts/stage-public-data.mjs `
  --news-input "<staging-dir>\games-news.json" `
  --calendar-input "<staging-dir>\release-calendar.json" `
  --output-dir data `
  --write
```

The write step validates both inputs before changing either output, writes each
public file atomically, rolls back the first file if the second replacement
fails, and reads both back inside the same rollback boundary to prove their
hashes, timestamps and counts match the consumed inputs. An exclusive lock
rejects overlapping writers. If a crashed process leaves
`data/.public-data-stage.lock`, verify that no staging process is active before
removing that ignored lock file. Source timestamps cannot move backwards over
readable current public metadata. The command does not commit, push, merge or
deploy. Those remain separate review actions.

Run the staging contract tests with:

```powershell
node --test test/public-data-stage.test.mjs
```

## Public host and lineup freshness

GitHub Pages publishes this site at `https://koltregaskes.github.io/gametrackdaily/`. Canonical, Open Graph, and JSON-LD URLs use that host. No custom domain is configured.

The home page and Games page label the studio lineup stale, with the date from `data/games-manifest.json` `updatedAt`, when that date is more than 30 days old. The label uses the manifest date and does not invent a newer roster.

## Deployment

The repo includes a GitHub Pages workflow in `.github/workflows/deploy.yml`.

Once GitHub Pages is enabled for the repository, pushes to `main` will publish the site automatically.

## Contributor Notes

- Keep visible naming aligned with `GameTrackDaily`.
- Treat this as a public showcase and reference surface, not an operations dashboard.
- If a change only helps local management, it belongs in the private console, not this repo.

## SEO contract

Run `node scripts/seo.mjs` after public content changes and `node scripts/seo.mjs --check` before committing. CI checks page canonical URLs, PNG sharing cards, JSON-LD, RSS, sitemap routes, robots and llms.txt. RSS uses source publication dates, never the build clock. Search Console and Bing verification and sitemap submission require the site owner.

## Launch checks

Run npm ci, npx playwright install chromium, npm test, node scripts/seo.mjs --check, npm run build, then npm run test:launch in a fresh checkout. The build copies public assets only. Tests cover all root HTML routes, including the calendar alias, at 320px and 1280px without a server. CONTACT_EMAIL in app.js is the single unset contact value pending domain and mail approval.

## Scheduled games news

The daily Actions refresh reads data/news-sources.json, writes real gaming sources into games-news.json, preserves unaffected rails, and records failed sources. All-source failure retains the prior file. Partial failures publish successful data and make the run red with a deduplicated issue alert. Only article/source-state changes create a commit; run timestamps stay in the uncommitted report. The workflow dispatches deploy.yml rather than copying Pages deployment steps.

## GitHub Pages security

GitHub Pages serves the existing project URL and supplies HSTS. It does not support repository-defined response headers: _headers files would have no effect. Each page therefore uses a CSP meta policy and strict-origin-when-cross-origin referrer metadata. CSP allows only local scripts, local data requests, required Google Fonts, HTTPS images and existing inline styles; objects and forms are disabled. GitHub Pages cannot enforce frame-ancestors, X-Frame-Options or X-Content-Type-Options from repository code. Those remain host limitations for owner acceptance, not claimed response headers. No host, DNS or account change is included. This static site has no form receiver, payment handler or API endpoint.

Security CI audits all pinned dependencies, runs Gitleaks with fully redacted output and a count-only summary, and crawls the rendered external links. Confirmed 404/410 and unsafe redirects fail; provider blocks and network failures are explicitly unverified. Local/private source directories and legacy assets are excluded from the public build.
GitHub Actions is the selected single writer for games-news.json. Cutover is pending retirement of the legacy Mini PC news publisher by its director; until then, two writers still exist. The Action handles one rejected push by fetching main, rebasing, and retrying exactly once. A data conflict or second rejection fails visibly and follows the existing issue-alert route. The Mini PC calendar export is a separate duty and must be preserved during news-publisher retirement.


The retired Summer Game Fest destinations are normalised by the calendar generator before both source-event import and calendar export. The reviewable pure policy is scripts/event-link-policy.mjs; it changes only the 11 verified retired paths, preserves historical source checks and original event facts, and is idempotent. Regeneration from an older event list therefore retains the corrected official festival destination and honest label.


## Verify public deployment bytes

Download the github-pages artifact from the successful deployment run for the expected main commit, extract artifact.tar into an ignored local directory, then run:

```text
node scripts/check-live.mjs <extracted-directory> <https-site-base-url/>
```

Record the run URL and its head SHA alongside the result. This compares every public artifact file with the live HTTPS response, including downloads and discovery files. Mismatches, missing files, blocked responses, network errors and the four-minute crawl deadline prevent a passing result. It prints paths and counts, never response bodies. A passing crawl proves those deployed bytes at the time checked, not freshness, source truth or launch acceptance.

Launch acceptance covers every route at 320, 390 and 1280 pixels, axe serious/critical issues, overflow, and keyboard activation of the skip link into the main landmark. Installed browser channels can be selected with PLAYWRIGHT_CHANNEL. This automated smoke check does not replace a manual screen-reader review.

SEO CI validates the built public artifact, not just source HTML: exact sitemap coverage, unique canonicals, sharing metadata, JSON-LD URLs, a real 1200x630 PNG, robots/llms and RSS item/source-date parity with the built news feed. The calendar alias remains canonical to releases. Final-domain and live readback acceptance remain separate after any approved domain change.

News ages are calculated from each original publishedAt at page load; saved relative ages and feed-refresh timestamps do not make undated stories recent. Unknown/future source dates and unavailable, future or over-72-hour feed editions are disclosed. This does not prove seven consecutive days of independent delivery, which remains launch acceptance work.

The empty June data/news-feed-latest.json and dated news-feed-* files are retained legacy archive artifacts, not the active news input or a fallback refresh source. The app, RSS generator and Actions news job use data/games-news.json. An empty legacy file is not freshness evidence.

External destination checks validate every redirect hop before requesting it: HTTPS only, no URL credentials, a finite hop limit, and no loops. Confirmed 404/410 and unsafe redirects fail; access blocks and network failures remain explicitly unverified. This supplements the existing link-reporting PR and does not claim blocked outlets were read.
