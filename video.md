# Kevlar — two-minute hackathon video

This is the final recording script for a video lasting **1:55–2:00**. The first ten seconds establish the core idea, the next fifty seconds explain the project, and the final minute demonstrates the working system.

Speak naturally at roughly 130–145 words per minute. Pause briefly when changing tabs so the judge can read the proof on screen.

Tell this as one continuous story, not as a feature list: Nova's price is misunderstood, Kevlar catches the silent mistake, Bright Data repairs the collector, and the Gauntlet proves the repair is safe.

## Final timed script

### 0:00–0:10 — Meet the problem

**Screen:** Open the [production home page](https://kevlar-web.vercel.app). Keep the hero text and the Acquire → Persist → Verify → Release pipeline visible.

**Action:** Do not scroll. Rest the cursor away from the heading.

**Say:**

> “Kevlar verifies web data before release. Nova costs 129 dollars, but when a scraper reports its 10.75 monthly plan as the price, Kevlar stops it.”

### 0:10–0:25 — The quiet failure

**Screen:** Show the first flowchart in [`1min.md`](1min.md) using a rendered Markdown preview.

**Action:** Point first to the website and Bright Data nodes, then to the Kevlar release gate.

**Say:**

> “Nothing crashes; the JSON is valid. But a false price-drop alert is ready to ship. Kevlar sits in the middle and asks: does this number still mean purchase price?”

### 0:25–0:42 — Follow the evidence

**Screen:** Keep the main flowchart visible.

**Action:** Follow the pass and fail branches with the cursor.

**Say:**

> “Bright Data's custom Browser worker collects the page and brings back typed fields, visible text, JSON-LD, API data, and a screenshot. Kevlar treats that bundle as evidence, not truth, and releases only verified facts to apps and AI.”

### 0:42–1:00 — Build the safety net

**Screen:** Scroll once to the repair-certification flowchart in [`1min.md`](1min.md).

**Action:** Trace Bright Data repair → Tribunal → human approval → Gauntlet → certificate.

**Say:**

> “When those signals disagree, Kevlar quarantines 10.75 and keeps the last trusted 129 available. Bright Data proposes a repair, but it still faces human review, held-out tests, negative controls, and a certificate before anything ships.”

### 1:00–1:12 — Start Nova's journey

**Screen:** Bright Data → **Scrapers** → **kevlar-nova-product-pricing** → **Code** → **Interaction code**.

**Action:** Keep the collector name and active status visible. Briefly point to `tag_script`, `tag_response`, `navigate`, and `tag_screenshot`; then click **Parser code**.

**Say:**

> “Let's follow Nova's journey. It begins inside our custom Bright Data Browser worker. The interaction code opens the page and tags the evidence; the parser turns it into a typed record.”

### 1:12–1:24 — See the healthy truth

**Screen:** Switch to the already-prepared Bright Data **Output** result. Do not start a new run during the recording.

**Action:** Point to `product`, `independent_sources`, and `evidence`. Make `$129`, `$10.75/month`, both supporting `129` values, and `screenshot_ref` visible.

**Say:**

> “On a healthy run, the story is clear: 129 dollars to buy, 10.75 per month. Visible text, JSON-LD, the public API, and the screenshot all travel with the result.”

### 1:24–1:41 — Watch the page change

**Screen:** Open the live [Trust Feed](https://kevlar-web.vercel.app/feed).

**Action:** Point in this order: **Observed by collector — $10.75**, **Released fact — $129.00**, **3 violations**, and **Alert consumer — blocked**.

**Say:**

> “Now the page changes. The collector brings back 10.75 as purchase price, yet nothing crashes. Kevlar spots the financing meaning, blocks the false alert, and keeps 129 clearly labelled as last-known-good.”

### 1:41–1:53 — Prove the repair learned

**Screen:** Open the live [Held-Out Gauntlet](https://kevlar-web.vercel.app/gauntlet).

**Action:** Point across the four metrics: **8/8**, **100%**, **0 false heals**, and **0 false releases**. Briefly show held-out cases H1/H2 and negative controls N1/N2.

**Say:**

> “Bright Data proposes the fix, but Kevlar asks: did it learn, or just memorize one page? Eight Gauntlet cases answer that—all pass, with zero false releases.”

### 1:53–2:00 — Finish the story

**Screen:** Open the live [Release Evidence](https://kevlar-web.vercel.app/release).

**Action:** Keep **24/24 labelled checks** and **0 false releases** visible. End the recording on this screen.

**Say:**

> “Twenty-four controlled checks prove the path. Bright Data keeps collectors alive; Kevlar keeps released facts honest.”

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
