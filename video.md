# Kevlar — two-minute hackathon video

This is the final recording script for a video lasting **1:55–2:00**. The first ten seconds establish the core idea, the next fifty seconds explain the project, and the final minute demonstrates the working system.

Speak naturally at roughly 130–145 words per minute. Pause briefly when changing tabs so the judge can read the proof on screen.

## Final timed script

### 0:00–0:10 — Core idea

**Screen:** Open the [production home page](https://kevlar-web.vercel.app). Keep the hero text and the Acquire → Persist → Verify → Release pipeline visible.

**Action:** Do not scroll. Rest the cursor away from the heading.

**Say:**

> “Web scrapers can fail silently: valid JSON with the wrong meaning. Kevlar is a verification firewall that stops bad data before production.”

### 0:10–0:25 — The concrete problem

**Screen:** Show the first flowchart in [`1min.md`](1min.md) using a rendered Markdown preview.

**Action:** Point first to the website and Bright Data nodes, then to the Kevlar release gate.

**Say:**

> “Nova costs 129 dollars once, or 10.75 monthly. A layout change can make a broken collector return financing as the purchase price. The JSON remains valid, so schema checks accept it.”

### 0:25–0:42 — Bright Data and Kevlar

**Screen:** Keep the main flowchart visible.

**Action:** Follow the pass and fail branches with the cursor.

**Say:**

> “Bright Data Scraper Studio Browser workers navigate, extract typed data, capture evidence, and propose repairs. Kevlar treats every row as untrusted, checks meaning, quarantines unsafe observations, and keeps the labelled 129-dollar last-known-good fact available.”

### 0:42–1:00 — Safe repair and delivery

**Screen:** Scroll once to the repair-certification flowchart in [`1min.md`](1min.md).

**Action:** Trace Bright Data repair → Tribunal → human approval → Gauntlet → certificate.

**Say:**

> “A repair cannot ship immediately. It faces Tribunal checks, human approval, held-out tests, negative controls, and a digest-bound certificate. Verified facts and events then reach REST, signed webhooks, the TypeScript SDK, read-only MCP, and a reviewed AI router.”

### 1:00–1:12 — Prove the custom Bright Data collector

**Screen:** Bright Data → **Scrapers** → **kevlar-nova-product-pricing** → **Code** → **Interaction code**.

**Action:** Keep the collector name and active status visible. Briefly point to `tag_script`, `tag_response`, `navigate`, and `tag_screenshot`; then click **Parser code**.

**Say:**

> “This is our custom Bright Data Browser worker, collector `c_mt3utzwt29hbznvax9`. Its interaction and parser code control navigation, typed extraction, and evidence capture.”

### 1:12–1:24 — Show structured output and evidence

**Screen:** Switch to the already-prepared Bright Data **Output** result. Do not start a new run during the recording.

**Action:** Point to `product`, `independent_sources`, and `evidence`. Make `$129`, `$10.75/month`, both supporting `129` values, and `screenshot_ref` visible.

**Say:**

> “The output separates the 129-dollar purchase price from 10.75 monthly financing and retains visible text, JSON-LD, the public API response, and a screenshot reference.”

### 1:24–1:41 — Show silent corruption being blocked

**Screen:** Open the live [Trust Feed](https://kevlar-web.vercel.app/feed).

**Action:** Point in this order: **Observed by collector — $10.75**, **Released fact — $129.00**, **3 violations**, and **Alert consumer — blocked**.

**Say:**

> “In the trust feed, the controlled redesign produces 10.75 as the purchase price. The row is schema-valid, but Kevlar quarantines it, blocks the false price-drop alert, and keeps 129 as last-known-good.”

### 1:41–1:53 — Show repair certification

**Screen:** Open the live [Held-Out Gauntlet](https://kevlar-web.vercel.app/gauntlet).

**Action:** Point across the four metrics: **8/8**, **100%**, **0 false heals**, and **0 false releases**. Briefly show held-out cases H1/H2 and negative controls N1/N2.

**Say:**

> “The repair passes all eight visible, held-out, and no-heal cases: 100-percent held-out, zero false heals, and zero false releases.”

### 1:53–2:00 — End on measured proof

**Screen:** Open the live [Release Evidence](https://kevlar-web.vercel.app/release).

**Action:** Keep **24/24 labelled checks** and **0 false releases** visible. End the recording on this screen.

**Say:**

> “Our controlled release passed 24 of 24 checks. Bright Data keeps collectors alive; Kevlar keeps released facts honest.”

## Prepare the demo before recording

### 1. Use a clean recording window

1. Record at 1440×900 or 1920×1080 with browser zoom at 100%.
2. Hide bookmarks, notifications, extensions, account email, and unrelated tabs.
3. Turn off password-manager popups and desktop notifications.
4. Never show a Bright Data API token, Convex deploy key, `.env` file, authorization header, or webhook secret.
5. Close chat windows and personal browser profiles from the captured area.

### 2. Prepare the first-minute visual

1. Open [`1min.md`](1min.md) in GitHub or a Markdown preview that renders Mermaid.
2. Confirm both diagrams render before recording.
3. Fit the first diagram to the screen for 0:10–0:42.
4. Pre-scroll or use a second preview tab for the repair diagram at 0:42, so only one clean transition is needed.

### 3. Collect the Bright Data proof

Before recording, open Bright Data and collect these two clean views:

| Proof view        | Where to open it                                               | What must be visible                                                                                                           |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Custom collector  | **Scrapers → kevlar-nova-product-pricing → Code**              | Collector name, active state, Interaction code, Parser code, and the custom Browser-worker calls                               |
| Structured result | **Code → Preview/Output**, using the required Nova `url` input | `$129` purchase price, `$10.75/month`, JSON-LD price `129`, public API price `129`, purchase context, and screenshot reference |

Use this exact preview input:

```text
https://kevlar-fixture-lab.vercel.app/product-pricing/nova
```

Run Preview **before** recording and keep the successful Output panel ready. If the preview session is unavailable, open **Initiate manually**, enter the same URL, click **Start**, open **Runs**, select the completed row, and choose **Download file options → JSON**. The run should show one record and zero failed crawls. Do not spend video time waiting for a network run.

The repository copies of the collector proof are available at:

- [`collectors/product-pricing/nova/interaction.js`](collectors/product-pricing/nova/interaction.js)
- [`collectors/product-pricing/nova/parser.js`](collectors/product-pricing/nova/parser.js)
- [`collectors/product-pricing/nova/input-schema.json`](collectors/product-pricing/nova/input-schema.json)
- [`collectors/product-pricing/nova/output-schema.json`](collectors/product-pricing/nova/output-schema.json)

If you save screenshots for editing, keep authenticated Bright Data captures in a private recording folder unless the image has been sanitized.

### 4. Collect the downloadable proof

These artifacts are useful for the submission description, judging questions, or a longer edit. Collect them before recording, but do not add more screens to the two-minute cut.

| Proof                       | Where to collect it                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Bright Data structured JSON | **Initiate manually → Start → Runs → completed row → Download file options → JSON**                                                          |
| Kevlar evidence bundle      | Open [Evidence](https://kevlar-web.vercel.app/evidence) → **Open downloadable evidence bundle** → **Download bundle JSON**                   |
| Repair Certificate          | Open the [Nova Repair Certificate](https://kevlar-web.vercel.app/certificates/nova-core-20260822075230) → **Download machine-readable JSON** |
| Benchmark reports           | Open [Release Evidence](https://kevlar-web.vercel.app/release) → **Raw JSON reports**                                                        |

Capture clean screenshots of the Bright Data output, Trust Feed, Gauntlet metrics and held-out rows, certificate, and release metrics. Crop the Bright Data account email and browser profile from any image intended for public submission.

### 5. Pre-open tabs in this exact order

1. [Kevlar home](https://kevlar-web.vercel.app)
2. Rendered [`1min.md`](1min.md) — main flow
3. Rendered [`1min.md`](1min.md) — repair flow
4. Bright Data — Interaction/Parser code
5. Bright Data — prepared Output result
6. [Trust Feed](https://kevlar-web.vercel.app/feed)
7. [Held-Out Gauntlet](https://kevlar-web.vercel.app/gauntlet)
8. [Release Evidence](https://kevlar-web.vercel.app/release)

Load every tab once before pressing Record. The three public Kevlar pages should show these exact anchors:

| Page       | Expected proof                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Trust Feed | Observed `$10.75`; released `$129.00`; last-known-good; three semantic violations; alert blocked              |
| Gauntlet   | `8/8`; `100%` held-out pass; `0` false heals; `0` false releases                                              |
| Release    | `24/24` controlled labelled checks; `0` false releases; `2/2` held-out repair; `80/80` measured live requests |

### 6. Rehearse the tab changes

1. Practice the complete recording twice without narration.
2. Practice once with narration and a timer.
3. Switch tabs using the keyboard rather than searching or typing URLs on camera.
4. Keep the cursor still while speaking; move it only to identify the next proof.
5. If the take exceeds two minutes, shorten pauses—do not remove the Bright Data proof, Trust Feed, Gauntlet, or closing metrics.

## Claims to say precisely

- Say **“controlled benchmark”** or **“fixture-backed release checks,”** not general web accuracy.
- Say Bright Data **proposes and applies the repair candidate**; Kevlar's gates and human review decide whether it can reach released data.
- Say **“integrity digest,”** not digital signature.
- Say Nova is the **fully rehearsed collector path**. Do not imply that every registered collector is already Kevlar-certified.
- The visible text, JSON-LD, public API response, and screenshot are multiple extraction channels from the controlled source; do not call them independent market authorities.

## Final export checklist

- Duration is between **1:55 and 2:00**.
- Narration is understandable without captions.
- Add English captions and check the spelling of **Kevlar**, **Bright Data**, **Scraper Studio**, **Gauntlet**, and **bitemporal**.
- Export H.264 video with AAC audio.
- Watch the exported file from beginning to end.
- Upload it to YouTube as public or unlisted, then test the link in a signed-out browser.
