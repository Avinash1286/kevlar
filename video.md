# Kevlar — two-minute hackathon video

This is the final recording script for a video lasting **1:55–2:00**. The first ten seconds establish the core idea, the next fifty seconds explain the project, and the final minute demonstrates the working system.

Speak naturally at roughly 138–142 words per minute. Pause briefly when changing tabs so the judge can read the proof on screen.

Tell this as one continuous story, not as a feature list: Nova's price is misunderstood, Kevlar catches the silent mistake, Bright Data repairs the collector, and the Gauntlet proves the repair is safe.

## Continuous narration — read this aloud

Read only these two paragraphs. The screen changes are in the separate cue sheet below so they do not interrupt your voice.

### First minute — the project story

> “Kevlar verifies web data before release. Imagine you're tracking Nova headphones. They cost 129 dollars, or 10.75 a month. Then the site changes. The scraper doesn't crash; the JSON looks fine. It simply calls 10.75 the purchase price, and a normal pipeline is ready to announce a huge price drop. Kevlar is built for that moment. It sits between the changing web and everything that relies on it, treating each value as a claim, not a fact. Bright Data's custom Scraper Studio worker collects the page, visible text, JSON-LD, API data, and a screenshot. Kevlar asks: do those pieces tell the same story? If not, it quarantines the new value and keeps the trusted 129 available. Bright Data can propose a repair, but before it ships, the fix must pass human review, held-out tests, negative controls, and certification.”

### Second minute — the live demo story

> “Now let me show you the journey. This is the custom Bright Data Browser worker behind Nova. Its interaction code opens the page and tags evidence; the parser turns it into a typed record. On a healthy run, the difference is clear: 129 dollars to buy, 10.75 a month. Visible text, JSON-LD, the public API response, and a screenshot stay attached. Then the page changes. Kevlar's trust feed receives 10.75 as the purchase price, recognizes financing, blocks the false alert, and keeps 129 as last-known-good. Bright Data proposes a fix, but Kevlar asks: did it learn, or did it memorize one page? The Gauntlet tests eight visible, held-out, and no-heal cases. Every one passes, with zero false releases. The whole path passes 24 controlled checks. Bright Data keeps collectors alive; Kevlar keeps released facts honest.”

## Screen cue sheet — do not read this aloud

| Approximate time | When you say                  | Screen                                                           | Silent action                                                               |
| ---------------- | ----------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0:00             | “Kevlar verifies web data…”   | [Production home](https://kevlar-web.vercel.app)                 | Keep the hero and Acquire → Persist → Verify → Release pipeline visible.    |
| 0:08             | “Then the site changes…”      | Main flowchart in [`1min.md`](1min.md)                           | Trace the source, Bright Data collector, and Kevlar release gate.           |
| 0:40             | “Kevlar asks: do those…”      | Repair flowchart in [`1min.md`](1min.md)                         | Trace quarantine → repair → human review → Gauntlet → certificate.          |
| 1:00             | “Let me show you…”            | Bright Data → **Scrapers → kevlar-nova-product-pricing → Code**  | Show Interaction code, then Parser code.                                    |
| 1:13             | “On a healthy run…”           | Prepared Bright Data **Output**                                  | Point to `product`, `independent_sources`, and `evidence`.                  |
| 1:27             | “Then the page changes…”      | Live [Trust Feed](https://kevlar-web.vercel.app/feed)            | Point to observed `$10.75`, released `$129`, violations, and blocked alert. |
| 1:40             | “Bright Data proposes a fix…” | Live [Held-Out Gauntlet](https://kevlar-web.vercel.app/gauntlet) | Show `8/8`, `100%`, zero false heals, and zero false releases.              |
| 1:52             | “The whole path passes…”      | Live [Release Evidence](https://kevlar-web.vercel.app/release)   | End on `24/24` controlled checks and zero false releases.                   |

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
3. Fit the first diagram to the screen for 0:08–0:40.
4. Pre-scroll or use a second preview tab for the repair diagram at 0:40, so only one clean transition is needed.

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
