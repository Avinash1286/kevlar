# Kevlar — 2:25 intuitive voiceover demo

This is the **voiceover alternative** to `demo.md`.

First record seven silent clips. Then assemble them into a 2-minute-25-second timeline and record one continuous voiceover while watching the finished visuals.

The narration follows one simple Nova headphones story. It explains the project, architecture, technology stack, live demo, and learning without sounding like a list of definitions.

Nova is a **live controlled fixture built for this demonstration**, not a real commercial product listing.

## Understand the story before recording

Nova headphones have two valid numbers:

- **$129** is the complete purchase price.
- **$10.75** is the monthly payment.

`$10.75 × 12 months = $129`, so nothing became cheaper. A redesigned layout merely causes the collector to place the monthly amount inside the full-price field.

Bright Data and Kevlar have different responsibilities:

- **Bright Data is the eyes:** it opens the page, extracts the fields, captures context, JSON-LD, the API response, and a screenshot, and may propose a repair.
- **Kevlar is the fact-checker and safety gate:** it checks what a number means and decides whether it is safe to release.
- **Convex is the memory:** it stores observations, decisions, and release history.
- **Next.js on Vercel is the window:** it shows the safe result to people and applications.

Bright Data is not being described as unreliable. Its collection engine can be running successfully while an older extraction rule is fooled by a redesigned layout. Kevlar adds an independent release decision so a collector never declares its own output to be truth.

Remember the whole story as:

```text
collect → check meaning → block unsafe claim → keep last-known-good
→ test repair → certify it → preserve the evidence trail
```

## Final timeline

| Clip | Time      | Final length | Raw target | Record on                  | Visual                         |
| ---: | --------- | -----------: | ---------: | -------------------------- | ------------------------------ |
|    1 | 0:00–0:27 |       27 sec |     31 sec | Kevlar `/`                 | Home and architecture pipeline |
|    2 | 0:27–0:45 |       18 sec |     22 sec | Bright Data Scraper Studio | Healthy collector Output       |
|    3 | 0:45–1:12 |       27 sec |     31 sec | Kevlar `/feed`             | Trust Feed blocks $10.75       |
|    4 | 1:12–1:34 |       22 sec |     26 sec | Kevlar `/gauntlet`         | Held-Out Gauntlet              |
|    5 | 1:34–1:55 |       21 sec |     25 sec | Kevlar certificate route   | Repair Certificate             |
|    6 | 1:55–2:11 |       16 sec |     20 sec | Kevlar `/evidence`         | Evidence Graph                 |
|    7 | 2:11–2:25 |       14 sec |     18 sec | Kevlar `/release`          | Release Evidence and closing   |

The final clips total exactly **145 seconds (2:25)**. Each raw target contains a two-second opening handle and a two-second closing handle that you remove during editing.

## Prepare the browser

Open these pages before recording:

| Tab | Page                                                                                           | Starting position                                                              |
| --: | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
|   1 | [Kevlar home](https://kevlar-web.vercel.app)                                                   | Top with **Trust the fact. Question the repair.** visible.                     |
|   2 | Bright Data Output                                                                             | Successful preview for `kevlar-nova-product-pricing`, positioned at `product`. |
|   3 | [Trust Feed](https://kevlar-web.vercel.app/feed)                                               | Observed $10.75 and released $129 visible.                                     |
|   4 | [Held-Out Gauntlet](https://kevlar-web.vercel.app/gauntlet)                                    | Top with 8/8, 100%, 0, and 0 visible.                                          |
|   5 | [Nova Repair Certificate](https://kevlar-web.vercel.app/certificates/nova-core-20260822075230) | Collector identity and case totals visible.                                    |
|   6 | [Evidence Graph](https://kevlar-web.vercel.app/evidence)                                       | Graph summary metrics visible.                                                 |
|   7 | [Release Evidence](https://kevlar-web.vercel.app/release)                                      | `LABELED CHECKS 24/24` and `FALSE RELEASES 0` visible.                         |

Load every page, confirm its expected values, and then record each clip separately. Page transitions and loading screens do not belong in this voiceover version.

Only Clip 2 is recorded on the Bright Data website. Clips 1 and 3–7 are recorded on the deployed Kevlar website. Do **not** record the fixture-lab product page directly; Bright Data visits that page internally to produce the Clip 2 Output.

### Prepare the Bright Data Output

1. In Bright Data, click **Scrapers**.
2. Open **kevlar-nova-product-pricing**.
3. Click **Code → Interaction code**.
4. In the lower panel, click **Input** and enter:

   ```text
   https://kevlar-fixture-lab.vercel.app/product-pricing/nova
   ```

5. Click the triangular Play button beside **Click play to test your code**.
6. Wait for a successful preview.
7. Click **Output**. If the large Output window does not open, click the single collected result once.
8. Confirm the preview contains:
   - purchase price `129`;
   - monthly payment `10.75`;
   - JSON-LD price `129`;
   - public API price `129`;
   - screenshot evidence.
9. Leave the Output window positioned at `product`.

If the preview says `navigate(undefined)` or `url is required`, return to **Input**, enter the URL again, and rerun it.

Configure the Bright Data crop or privacy mask before recording. The final video must not show the credit balance, profile initial, Billing section, address-bar draft ID, Run log, peer IP, or account email. Never click **Active scraper**, **Finish editing**, **Start**, or a download button while recording.

## Part 1 — Record the seven silent clips

For every clip:

1. Navigate and prepare the starting screen while the recorder is stopped.
2. Start recording and hold still for two seconds.
3. Perform only the actions listed for that clip.
4. Hold the final screen for two seconds and stop.
5. Save it with the suggested filename.
6. Remove the two handles when assembling the final timeline.

### Clip 1 — Home and architecture

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app](https://kevlar-web.vercel.app)

**Exact route:** `/`

**Filename:** `01-home-architecture.mp4`

**Keep:** 27 seconds.

**Record these visuals:**

1. Begin at the home-page hero.
2. Keep **Trust the fact. Question the repair.** visible for approximately 10 seconds.
3. Slowly scroll to **Acquire → Persist → Verify → Release**.
4. Move the cursor across the pipeline without clicking.
5. End with the whole pipeline visible.

The narration will explain the practical problem and map Bright Data, Kevlar, Convex, Next.js, and Vercel onto this pipeline.

### Clip 2 — Healthy Bright Data evidence

**Record on:** **Bright Data website**, inside Scraper Studio—not on a Kevlar route.

**Exact navigation:** Bright Data control panel → **Scrapers** → **kevlar-nova-product-pricing** → **Code** → **Interaction code** → **Input** → Play → **Output**.

Begin recording only after the successful large **Output** window is open. The fixture URL is an input to the collector; it is not the page you record.

**Filename:** `02-brightdata-output.mp4`

**Keep:** 18 seconds.

**Record these visuals:**

1. Begin with the large **Output** window and `product` visible.
2. Point to purchase price `129`.
3. Point to monthly payment `10.75`.
4. Scroll only inside the Output window.
5. Show JSON-LD `129`, public API `129`, and the evidence or screenshot reference.
6. End on the evidence.

This is a healthy Bright Data **preview**, not a production run.

### Clip 3 — Wrong meaning blocked

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/feed](https://kevlar-web.vercel.app/feed)

**Exact route:** `/feed`

**Filename:** `03-trust-feed.mp4`

**Keep:** 27 seconds.

**Record these visuals:**

1. Point to **Observed by collector — $10.75**.
2. Move to the JSON-LD and public API values of `129`.
3. Point to **3 violations**.
4. Point to **Alert consumer — blocked**.
5. End on **Released fact — $129.00** and **Last-known-good · stale**.

The important visual contrast is `$10.75 observed` versus `$129 released`.

### Clip 4 — Repair generalization

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/gauntlet](https://kevlar-web.vercel.app/gauntlet)

**Exact route:** `/gauntlet`

**Filename:** `04-gauntlet.mp4`

**Keep:** 22 seconds.

**Record these visuals:**

1. Begin with **8/8**, **100% held-out pass**, **0 false heals**, and **0 false releases**.
2. Hold the headline metrics for about 10 seconds.
3. Scroll smoothly through held-out cases H1/H2.
4. Continue through no-heal controls N1/N2.
5. Do not scroll backward if you overshoot; restart the recording instead.

The held-out cases represent unseen DOM layouts, not unrelated commercial websites.

### Clip 5 — Human approval and certificate

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/certificates/nova-core-20260822075230](https://kevlar-web.vercel.app/certificates/nova-core-20260822075230)

**Exact route:** `/certificates/nova-core-20260822075230`

**Filename:** `05-certificate.mp4`

**Keep:** 21 seconds.

**Record these visuals:**

1. Begin with the collector identity.
2. Point to **4/4 visible**, **2/2 held-out**, and **2/2 negative controls**.
3. Scroll once to human approval and the integrity digest.
4. End with those proof fields visible.

The integrity digest helps detect changes to the measured certificate payload. It is not a digital signature.

### Clip 6 — Evidence trail

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/evidence](https://kevlar-web.vercel.app/evidence)

**Exact route:** `/evidence`

**Filename:** `06-evidence.mp4`

**Keep:** 16 seconds.

**Record these visuals:**

1. Point across **14 nodes**, **13 edges**, **10 artifacts**, and **4 archived evidence**.
2. Point at **Open downloadable evidence bundle**, but do not click it.
3. Slowly scroll the ledger past `change_event`, `fact_version`, `repair_certificate`, `observation`, `collector`, and `evidence`.

This graph shows the verified release chain. Do not describe it as the rejected Nova observation.

### Clip 7 — Measured release result

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/release](https://kevlar-web.vercel.app/release)

**Exact route:** `/release`

**Filename:** `07-release.mp4`

**Keep:** 14 seconds.

**Record these visuals:**

1. Begin with the Release Evidence heading.
2. Point to **LABELED CHECKS — 24/24**.
3. Point to **FALSE RELEASES — 0**.
4. Stop moving and hold this screen for the final line.

These are controlled, fixture-backed measurements, not a claim of perfect accuracy across the web.

## Part 2 — Record this continuous voiceover

Assemble Clips 1–7 to the exact final lengths before recording narration. Read the following as one connected story. Do not announce clip numbers or pause when the screen changes.

The script is approximately **306 spoken words**, about **127 words per minute**, which leaves room for a calm delivery.

### 0:00–0:27 — Home and architecture

> “Imagine a controlled shopping example: Nova headphones cost one twenty-nine, or ten seventy-five a month. Those are both correct, but they mean different things. After a redesign, valid JSON calls the monthly payment the full price, creating a fake, nearly 92-percent drop. Bright Data gathers the evidence. Kevlar checks meaning, Convex keeps history, and Next.js on Vercel shows the safe decision.”

### 0:27–0:45 — Bright Data evidence

> “This healthy Bright Data preview separates one twenty-nine from ten seventy-five monthly. Its Browser collector also captures context, JSON-LD, the API response, and a screenshot. Bright Data supplies the claim and evidence; Kevlar decides later whether it is safe.”

### 0:45–1:12 — Trust Feed

> “Then the redesigned layout fools the same collector and reports ten seventy-five as the full price. The number is valid, but financing language and two corroborating evidence channels still point to one twenty-nine. Kevlar quarantines the new observation, blocks the false alert, and keeps one twenty-nine available as clearly labelled last-known-good and stale.”

### 1:12–1:34 — Held-Out Gauntlet

> “So how do we trust a repair? Bright Data may propose a candidate, but Kevlar asks whether it learned the meaning or memorized one layout. The certification suite tests four known cases, two held-out layouts, and two no-heal controls. All eight pass, with no false heals or releases.”

### 1:34–1:55 — Repair Certificate

> “Even passing tests does not release the repair. This certificate records the same collector identity, earlier human approval, four visible, two held-out, and two negative-control outcomes, plus an integrity digest. Only that certified repair may enter limited canary activation.”

### 1:55–2:11 — Evidence Graph

> “The same evidence discipline continues after release. This graph links a released event to its fact, verified observation, collector, supporting evidence, and certificate. A reviewer can download the bundle instead of trusting only a green badge.”

### 2:11–2:25 — Release Evidence and closing

> “All 24 controlled checks pass with zero false releases. The lesson is simple: valid JSON is not automatically true data. Bright Data keeps collection moving; Kevlar keeps released facts honest.”

## Part 3 — Assemble and verify

1. Put the seven clips on the timeline in numerical order.
2. Trim them to the exact final lengths in the timeline table.
3. Use clean cuts without decorative transitions.
4. Record the voiceover as one take while watching the assembled visuals.
5. Keep background music optional and very quiet.
6. Generate captions and correct Kevlar, Bright Data, JSON-LD, Convex, Gauntlet, and last-known-good.
7. Confirm no private Bright Data information is visible.
8. Export as H.264 video with AAC audio.
9. Confirm the final duration is 2:25 or slightly shorter and never above 2:30.

## Final proof checklist

The finished video should visibly prove:

- Bright Data collected `$129`, `$10.75`, JSON-LD, API data, and screenshot evidence;
- Kevlar observed `$10.75` but released labelled last-known-good `$129`;
- the false alert was blocked;
- the repair passed visible, held-out-layout, and no-heal tests;
- certification recorded human approval and measured results;
- a released event retained a downloadable evidence trail;
- the controlled release passed 24/24 checks with zero false releases.

Use **controlled benchmark** or **fixture-backed benchmark**. Never describe these measurements as general web accuracy.
