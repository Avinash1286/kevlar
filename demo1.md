# Kevlar — 2:25 intuitive voiceover demo

This is the **voiceover alternative** to `demo.md`.

First record eight silent clips. Then assemble them into a 2-minute-25-second timeline and record one continuous voiceover while watching the finished visuals.

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

| Clip | Time      | Final length | Raw target | Record on                  | Visual                             |
| ---: | --------- | -----------: | ---------: | -------------------------- | ---------------------------------- |
|    1 | 0:00–0:18 |       18 sec |     22 sec | Kevlar `/`                 | Project and Nova problem           |
|    2 | 0:18–0:38 |       20 sec |     24 sec | Kevlar `/architecture`     | Full stack and system architecture |
|    3 | 0:38–0:56 |       18 sec |     22 sec | Bright Data Scraper Studio | Healthy collector Output           |
|    4 | 0:56–1:20 |       24 sec |     28 sec | Kevlar `/feed`             | Trust Feed blocks $10.75           |
|    5 | 1:20–1:40 |       20 sec |     24 sec | Kevlar `/gauntlet`         | Held-Out Gauntlet                  |
|    6 | 1:40–1:57 |       17 sec |     21 sec | Kevlar certificate route   | Repair Certificate                 |
|    7 | 1:57–2:11 |       14 sec |     18 sec | Kevlar `/evidence`         | Evidence Graph                     |
|    8 | 2:11–2:25 |       14 sec |     18 sec | Kevlar `/release`          | Release Evidence and closing       |

The final clips total exactly **145 seconds (2:25)**. Each raw target contains a two-second opening handle and a two-second closing handle that you remove during editing.

## Prepare the browser

Open these pages before recording:

| Tab | Page                                                                                           | Starting position                                                              |
| --: | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
|   1 | [Kevlar home](https://kevlar-web.vercel.app)                                                   | Top with **Trust the fact. Question the repair.** visible.                     |
|   2 | [System Architecture](https://kevlar-web.vercel.app/architecture)                              | Entire architecture diagram visible; do not scroll.                            |
|   3 | Bright Data Output                                                                             | Successful preview for `kevlar-nova-product-pricing`, positioned at `product`. |
|   4 | [Trust Feed](https://kevlar-web.vercel.app/feed)                                               | Observed $10.75 and released $129 visible.                                     |
|   5 | [Held-Out Gauntlet](https://kevlar-web.vercel.app/gauntlet)                                    | Top with 8/8, 100%, 0, and 0 visible.                                          |
|   6 | [Nova Repair Certificate](https://kevlar-web.vercel.app/certificates/nova-core-20260822075230) | Collector identity and case totals visible.                                    |
|   7 | [Evidence Graph](https://kevlar-web.vercel.app/evidence)                                       | Graph summary metrics visible.                                                 |
|   8 | [Release Evidence](https://kevlar-web.vercel.app/release)                                      | `LABELED CHECKS 24/24` and `FALSE RELEASES 0` visible.                         |

Load every page, confirm its expected values, and then record each clip separately. Page transitions and loading screens do not belong in this voiceover version.

Only Clip 3 is recorded on the Bright Data website. Clips 1–2 and 4–8 are recorded on the deployed Kevlar website. Do **not** record the fixture-lab product page directly; Bright Data visits that page internally to produce the Clip 3 Output.

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

## Part 1 — Record the eight silent clips

For every clip:

1. Navigate and prepare the starting screen while the recorder is stopped.
2. Start recording and hold still for two seconds.
3. Perform only the actions listed for that clip.
4. Hold the final screen for two seconds and stop.
5. Save it with the suggested filename.
6. Remove the two handles when assembling the final timeline.

### Clip 1 — Project and Nova problem

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app](https://kevlar-web.vercel.app)

**Exact route:** `/`

**Filename:** `01-project-problem.mp4`

**Keep:** 18 seconds.

**Record these visuals:**

1. Begin at the home-page hero with **Trust the fact. Question the repair.** fully visible.
2. Hold still for approximately eight seconds while the Nova example begins.
3. Point once to the sentence explaining that Kevlar sits between collectors and production systems.
4. Slowly scroll until **Acquire → Persist → Verify → Release** enters the bottom half of the frame.
5. End without clicking anything.

This clip introduces the practical mistake. Do not try to explain the architecture here; the next screen shows it directly.

### Clip 2 — Full system architecture

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/architecture](https://kevlar-web.vercel.app/architecture)

**Exact route:** `/architecture`

**Filename:** `02-system-architecture.mp4`

**Keep:** 20 seconds.

**Before recording:**

1. Use a desktop browser at 1920×1080 or 1440×900.
2. Press `F11` so the browser toolbar does not consume the frame.
3. Reload once before recording and confirm the entire diagram is visible.
4. Do not zoom, scroll, or open a link during this clip.

**Record these visuals:**

1. Begin with the complete diagram visible and hold for two seconds.
2. Trace the top path from **Nova fixture** to **Bright Data**, **Convex**, and the **TypeScript gate**.
3. Point to the green **PASS** arrow and **Next.js on Vercel** release box.
4. Move to **FAIL PATH** and trace **Quarantine $10.75 → Bright Data candidate → Human approval → Held-out Gauntlet → Certificate**.
5. End with the cursor back on the **TypeScript gate** to show that a certified repair re-enters verification.

This is the architecture proof required by the submission. The technology names and both the safe-release and repair paths must remain readable on screen.

### Clip 3 — Healthy Bright Data evidence

**Record on:** **Bright Data website**, inside Scraper Studio—not on a Kevlar route.

**Exact navigation:** Bright Data control panel → **Scrapers** → **kevlar-nova-product-pricing** → **Code** → **Interaction code** → **Input** → Play → **Output**.

Begin recording only after the successful large **Output** window is open. The fixture URL is an input to the collector; it is not the page you record.

**Filename:** `03-brightdata-output.mp4`

**Keep:** 18 seconds.

**Record these visuals:**

1. Begin with the large **Output** window and `product` visible.
2. Point to purchase price `129`.
3. Point to monthly payment `10.75`.
4. Scroll only inside the Output window.
5. Show JSON-LD `129`, public API `129`, and the evidence or screenshot reference.
6. End on the evidence.

This is a healthy Bright Data **preview**, not a production run.

### Clip 4 — Wrong meaning blocked

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/feed](https://kevlar-web.vercel.app/feed)

**Exact route:** `/feed`

**Filename:** `04-trust-feed.mp4`

**Keep:** 24 seconds.

**Record these visuals:**

1. Point to **Observed by collector — $10.75**.
2. Move to the JSON-LD and public API values of `129`.
3. Point to **3 violations**.
4. Point to **Alert consumer — blocked**.
5. End on **Released fact — $129.00** and **Last-known-good · stale**.

The important visual contrast is `$10.75 observed` versus `$129 released`.

### Clip 5 — Repair generalization

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/gauntlet](https://kevlar-web.vercel.app/gauntlet)

**Exact route:** `/gauntlet`

**Filename:** `05-gauntlet.mp4`

**Keep:** 20 seconds.

**Record these visuals:**

1. Begin with **8/8**, **100% held-out pass**, **0 false heals**, and **0 false releases**.
2. Hold the headline metrics for about 10 seconds.
3. Scroll smoothly through held-out cases H1/H2.
4. Continue through no-heal controls N1/N2.
5. Do not scroll backward if you overshoot; restart the recording instead.

The held-out cases represent unseen DOM layouts, not unrelated commercial websites.

### Clip 6 — Human approval and certificate

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/certificates/nova-core-20260822075230](https://kevlar-web.vercel.app/certificates/nova-core-20260822075230)

**Exact route:** `/certificates/nova-core-20260822075230`

**Filename:** `06-certificate.mp4`

**Keep:** 17 seconds.

**Record these visuals:**

1. Begin with the collector identity.
2. Point to **4/4 visible**, **2/2 held-out**, and **2/2 negative controls**.
3. Scroll once to human approval and the integrity digest.
4. End with those proof fields visible.

The integrity digest helps detect changes to the measured certificate payload. It is not a digital signature.

### Clip 7 — Evidence trail

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/evidence](https://kevlar-web.vercel.app/evidence)

**Exact route:** `/evidence`

**Filename:** `07-evidence.mp4`

**Keep:** 14 seconds.

**Record these visuals:**

1. Point across **14 nodes**, **13 edges**, **10 artifacts**, and **4 archived evidence**.
2. Point at **Open downloadable evidence bundle**, but do not click it.
3. Slowly scroll the ledger past `change_event`, `fact_version`, `repair_certificate`, `observation`, `collector`, and `evidence`.

This graph shows the verified release chain. Do not describe it as the rejected Nova observation.

### Clip 8 — Measured release result

**Record on:** **Kevlar website**, [https://kevlar-web.vercel.app/release](https://kevlar-web.vercel.app/release)

**Exact route:** `/release`

**Filename:** `08-release.mp4`

**Keep:** 14 seconds.

**Record these visuals:**

1. Begin with the Release Evidence heading.
2. Point to **LABELED CHECKS — 24/24**.
3. Point to **FALSE RELEASES — 0**.
4. Stop moving and hold this screen for the final line.

These are controlled, fixture-backed measurements, not a claim of perfect accuracy across the web.

## Part 2 — Record this continuous voiceover

Assemble Clips 1–8 to the exact final lengths before recording narration. Read the following as one connected story. Do not announce clip numbers or pause when the screen changes.

The script is approximately **307 spoken words**, about **127 words per minute**, which leaves room for a natural delivery.

### 0:00–0:18 — Project and Nova problem

> “Nova headphones cost one twenty-nine, or ten seventy-five a month. After a redesign, valid JSON puts the monthly amount in the purchase-price field. Kevlar sits between the collector and shopping agent, stopping a false price-drop alert.”

### 0:18–0:38 — Visible system architecture

> “Here is the full path. Bright Data collects the page and evidence. Convex stores the run and history. TypeScript checks schema, meaning, evidence, and release policy. A pass reaches Next.js on Vercel. A failure keeps one twenty-nine available and enters the tested, human-approved repair loop.”

### 0:38–0:56 — Bright Data evidence

> “This healthy Bright Data preview keeps one twenty-nine separate from ten seventy-five monthly, with page context, JSON-LD, an API response, and a screenshot. Kevlar receives the structured output as a claim to verify.”

### 0:56–1:20 — Trust Feed

> “On the redesigned layout, the collector instead reports ten seventy-five as the purchase price. The number is valid, but financing words and the other evidence still point to one twenty-nine. Kevlar quarantines it, blocks the false alert, and keeps one twenty-nine available as clearly labelled last-known-good and stale.”

### 1:20–1:40 — Held-Out Gauntlet

> “Now Bright Data may propose a repair, but fixing one page is not enough. The Gauntlet tests four known layouts, two held-out layouts the repair never saw, and two no-heal controls where refusing is correct. All eight pass, with no false heals or releases.”

### 1:40–1:57 — Repair Certificate

> “Even that result cannot release the repair by itself. This certificate binds the same Collector ID to earlier human approval, measured outcomes, and an integrity digest. It records exactly which repair earned certified status.”

### 1:57–2:11 — Evidence Graph

> “After release, this graph connects the event to its fact, verified observation, collector, evidence, and certificate. A reviewer can download the same proof instead of trusting a green badge.”

### 2:11–2:25 — Release Evidence and closing

> “Finally, the fixture-backed suite passes twenty-four checks with zero false releases. The lesson is simple: a scrape is still a claim. Bright Data keeps collectors alive; Kevlar keeps facts honest.”

## Part 3 — Assemble and verify

1. Put the eight clips on the timeline in numerical order.
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

- the architecture screen names Bright Data, Convex, TypeScript, Next.js, and Vercel and shows both the pass and certified-repair paths;
- Bright Data collected `$129`, `$10.75`, JSON-LD, API data, and screenshot evidence;
- Kevlar observed `$10.75` but released labelled last-known-good `$129`;
- the false alert was blocked;
- the repair passed visible, held-out-layout, and no-heal tests;
- certification recorded human approval and measured results;
- a released event retained a downloadable evidence trail;
- the controlled release passed 24/24 checks with zero false releases.

Use **controlled benchmark** or **fixture-backed benchmark**. Never describe these measurements as general web accuracy.
