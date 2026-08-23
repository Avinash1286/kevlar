# Kevlar — two-minute voiceover video plan

Record the visuals first without speaking. Assemble the eight silent clips into a two-minute timeline, then record the voiceover while watching the finished sequence.

The final structure is:

- **0:00–1:00:** explain the project through the Nova story;
- **1:00–2:00:** demonstrate the real Bright Data and Kevlar proof;
- **final duration:** exactly **2:00**.

## Part 1 — Record these clips first

### Recording setup

1. Record at 1440×900 or 1920×1080 with browser zoom at 100%.
2. Record screen video only. Keep the microphone muted during this stage.
3. Hide bookmarks, notifications, extensions, personal email, browser profile, and unrelated tabs.
4. Never show API tokens, Convex deploy keys, `.env` files, authorization headers, or webhook secrets.
5. Load every page before recording so no clip contains a spinner or page transition.
6. Record two extra seconds before and after every shot. These handles are removed during editing.
7. Move the cursor slowly and only when the instructions below ask you to identify something.
8. Do not run a new Bright Data collection while recording. Prepare its successful Output panel beforehand.

### Final shot list

| Clip | Section | Final length | Raw recording target | Suggested filename         | Screen                              |
| ---- | ------- | -----------: | -------------------: | -------------------------- | ----------------------------------- |
| 1    | Project |        9 sec |               13 sec | `01-home.mp4`              | Kevlar home                         |
| 2    | Project |       21 sec |               25 sec | `02-core-flow.mp4`         | Core system flowchart               |
| 3    | Project |       30 sec |               34 sec | `03-repair-flow.mp4`       | Repair-certification flowchart      |
| 4    | Demo    |       12 sec |               16 sec | `04-brightdata-code.mp4`   | Bright Data interaction/parser code |
| 5    | Demo    |       12 sec |               16 sec | `05-brightdata-output.mp4` | Bright Data structured Output       |
| 6    | Demo    |       14 sec |               18 sec | `06-trust-feed.mp4`        | Kevlar Trust Feed                   |
| 7    | Demo    |       14 sec |               18 sec | `07-gauntlet.mp4`          | Held-Out Gauntlet                   |
| 8    | Demo    |        8 sec |               12 sec | `08-release.mp4`           | Release evidence                    |

The edited clips total exactly 120 seconds.

### Clip 1 — Kevlar home

**Open:** [https://kevlar-web.vercel.app](https://kevlar-web.vercel.app)

Record this:

1. Wait until the home page is completely loaded.
2. Begin with **Trust the fact. Question the repair.** visible.
3. Hold the opening frame for two seconds.
4. Scroll slowly enough to reveal the **Acquire → Persist → Verify → Release** pipeline.
5. Hold on the pipeline before ending the raw clip.

Keep 9 seconds in the final edit.

### Clip 2 — Core system flow

**Open:** the rendered first flowchart in [`1min.md`](1min.md).

Record this:

1. Use GitHub or a Markdown preview that renders Mermaid.
2. Fit the entire **Core system flow** diagram on screen.
3. Hold for two seconds without moving the cursor.
4. Trace **Governed public website → Bright Data → evidence → untrusted observation → Kevlar release gate**.
5. Briefly follow the **Pass** branch to verified consumers.
6. Return to the gate and point to the **Fail** branch.
7. End with the release gate centered.

Keep 21 seconds in the final edit.

### Clip 3 — Repair-certification flow

**Open:** the rendered second flowchart in [`1min.md`](1min.md).

Record this:

1. Fit the whole **Repair-certification flow** on screen.
2. Hold for two seconds.
3. Trace **schema-valid but wrong → false alert blocked → $129 last-known-good**.
4. Continue through **Bright Data self-heal → Tribunal → human approval → Gauntlet**.
5. Point to the eight-case label: four visible, two held-out, and two no-heal controls.
6. Finish on **Repair Certificate → canary activation → normal verification**.
7. Hold the final frame.

Keep 30 seconds in the final edit.

### Clip 4 — Bright Data custom collector code

**Open:** Bright Data → **Scrapers → kevlar-nova-product-pricing → Code → Interaction code**.

Record this:

1. Crop the browser so the collector name and active status are visible without exposing the account email.
2. Start on **Interaction code**.
3. Point briefly to `tag_script`, `tag_response`, `navigate`, and `tag_screenshot`.
4. Click **Parser code** once.
5. Hold on the parser long enough to show that this is a custom Browser worker.
6. Do not press Play or trigger a run during this clip.

Keep 12 seconds in the final edit.

### Clip 5 — Bright Data structured output

Before recording, run Preview with this required `url` input and leave the successful Output panel open:

```text
https://kevlar-fixture-lab.vercel.app/product-pricing/nova
```

Record this:

1. Start with `product` expanded so the $129 purchase price and $10.75 monthly payment are visible.
2. Move slowly to `independent_sources` and show `jsonld_price: 129` and `public_api_price: 129`.
3. Move to `evidence` and show the purchase context plus `screenshot_ref`.
4. Do not show account details or credentials.
5. End with the structured result still visible.

Keep 12 seconds in the final edit.

### Clip 6 — Kevlar blocks the wrong value

**Open:** [https://kevlar-web.vercel.app/feed](https://kevlar-web.vercel.app/feed)

Record this:

1. Wait until the live data appears.
2. Point to **Observed by collector — $10.75**.
3. Move to **Released fact — $129.00** and **Last-known-good · stale**.
4. Point to **3 violations**.
5. End on **Alert consumer — blocked**.
6. Do not scroll away from the comparison and trust cards.

Keep 14 seconds in the final edit.

### Clip 7 — Kevlar proves the repair

**Open:** [https://kevlar-web.vercel.app/gauntlet](https://kevlar-web.vercel.app/gauntlet)

Record this:

1. Begin with the four headline metrics visible.
2. Point across **8/8**, **100% held-out pass**, **0 false heals**, and **0 false releases**.
3. Scroll smoothly through held-out cases H1/H2.
4. Continue to the negative controls N1/N2.
5. Hold the final case for one second.

Keep 14 seconds in the final edit.

### Clip 8 — End on measured proof

**Open:** [https://kevlar-web.vercel.app/release](https://kevlar-web.vercel.app/release)

Record this:

1. Keep the release heading and metric cards visible.
2. Point to **24/24 labelled checks**.
3. Move once to **0 false releases**.
4. Do not scroll.
5. Hold this screen through the closing line.

Keep 8 seconds in the final edit.

## Part 2 — Add this voiceover to each clip

Assemble and trim all eight clips before recording the voiceover. The preferred method is one continuous voiceover take while watching the two-minute timeline. The clip divisions below tell you where each sentence belongs; do not announce clip numbers or reset your tone between them.

Read prices conversationally: say **“one twenty-nine”** for $129 and **“ten seventy-five a month”** for $10.75/month.

### Voiceover for Clip 1 — 0:00–0:09

> “Kevlar is a verification firewall for web data. It catches the moment when a healthy-looking scraper returns the wrong fact.”

### Voiceover for Clip 2 — 0:09–0:30

> “Imagine tracking Nova headphones. They cost 129 dollars, with a 10.75 monthly plan. Then the site changes. The JSON still looks valid, but the scraper quietly calls 10.75 the purchase price. A normal pipeline is now ready to announce a huge price drop.”

### Voiceover for Clip 3 — 0:30–1:00

> “Kevlar stops that moment. Bright Data's custom Scraper Studio worker collects the page, visible text, JSON-LD, API data, and a screenshot. Kevlar treats the result as a claim and asks whether the evidence agrees. If it does not, 10.75 is quarantined while the trusted 129 stays available. Bright Data can propose a repair, but before it ships, the fix must pass human review, held-out tests, negative controls, and certification.”

### Voiceover for Clip 4 — 1:00–1:12

> “Now let's follow that path in the real system. This custom Bright Data Browser worker opens Nova, tags the evidence, and turns the result into a typed record.”

### Voiceover for Clip 5 — 1:12–1:24

> “On a healthy run, the difference is clear: 129 dollars to buy, 10.75 a month. Visible text, JSON-LD, the public API response, and screenshot evidence all stay attached.”

### Voiceover for Clip 6 — 1:24–1:38

> “Then the page changes. Kevlar's trust feed receives 10.75 as the purchase price, recognizes that it actually means financing, blocks the false alert, and keeps 129 clearly labelled as last-known-good.”

### Voiceover for Clip 7 — 1:38–1:52

> “Bright Data proposes a fix, but Kevlar asks: did it learn, or memorize one page? The Gauntlet tests eight visible, held-out, and no-heal cases. All pass, with zero false releases.”

### Voiceover for Clip 8 — 1:52–2:00

> “The full path passes 24 controlled checks. Bright Data keeps collectors alive; Kevlar keeps released facts honest.”

## Part 3 — Assemble the final video

1. Put Clips 1–8 on the timeline in numerical order.
2. Trim them to the exact final lengths in the shot-list table.
3. Use clean cuts. Avoid decorative transitions that hide evidence or consume time.
4. Record the voiceover while watching the assembled timeline.
5. Start the first spoken word at 0:00 and finish the closing word before 2:00.
6. If recording each voiceover clip separately, keep the same microphone distance and tone, and leave half a second of room tone at both ends.
7. Keep background music optional and very low; speech must remain dominant.
8. Generate captions from the final voice track and manually correct Kevlar, Bright Data, Scraper Studio, JSON-LD, Gauntlet, and last-known-good.
9. Check that no Bright Data email, profile name, token, or unrelated browser tab is visible.
10. Export as H.264 video with AAC audio.
11. Watch the export from beginning to end and confirm the duration is exactly two minutes or a few frames shorter.

## Final proof checklist

Before exporting, confirm the recorded screens show:

- Bright Data custom collector `kevlar-nova-product-pricing`;
- custom Interaction and Parser code;
- purchase price $129 and monthly payment $10.75;
- JSON-LD and public API values of 129;
- Trust Feed observed $10.75 but released $129 last-known-good;
- blocked false alert;
- Gauntlet 8/8, 100% held-out, zero false heals, and zero false releases;
- Release Evidence 24/24 controlled checks and zero false releases.

Use the phrase **controlled checks** or **fixture-backed benchmark**. Do not present these measurements as general web accuracy.
