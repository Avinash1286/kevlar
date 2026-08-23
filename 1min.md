# Kevlar — one-minute project explainer

> **Kevlar is a verification firewall for live-web intelligence: Bright Data collects and self-heals, while Kevlar decides what is safe to release.**

Use this page as the visual for the first minute of the hackathon video. Show the main flow first, then the repair flow.

## 1. Core system flow

```mermaid
flowchart TB
  SOURCE["Governed public website"] --> BD["Bright Data Scraper Studio<br/>Custom Browser collector"]
  BD --> CAPTURE["Typed row plus evidence<br/>Visible text · JSON-LD · API · screenshot"]
  CAPTURE --> UNTRUSTED["Untrusted observation"]
  UNTRUSTED --> GATE{"Kevlar release gate<br/>Schema · meaning · evidence · policy"}

  GATE -->|"Pass"| INTEL["Canonical entity<br/>Append-only bitemporal fact"]
  INTEL --> EVENT["Verified semantic event"]
  EVENT --> CONSUMERS["REST · signed webhooks · SDK<br/>read-only MCP · reviewed AI router"]

  GATE -->|"Fail"| QUARANTINE["Quarantine suspect value"]
  QUARANTINE --> LKG["Keep labelled last-known-good fact"]
  QUARANTINE --> REPAIR["Open repair-certification path"]
```

The invariant behind the diagram is:

```text
collector row != verified observation != released fact
```

## 2. Repair-certification flow

```mermaid
flowchart TB
  BAD["Schema-valid but wrong<br/>Purchase price became the monthly payment"] --> BLOCK["False price-drop alert blocked"]
  BLOCK --> SAFE["USD 129 last-known-good stays available"]
  BLOCK --> HEAL["Bright Data proposes a self-heal candidate"]
  HEAL --> TRIBUNAL["Kevlar Repair Tribunal<br/>Contract · evidence · risk · blast radius"]
  TRIBUNAL --> HUMAN{"Human approves candidate?"}

  HUMAN -->|"No"| HOLD["Remain quarantined"]
  HUMAN -->|"Yes"| GAUNTLET["Same Collector ID<br/>4 visible + 2 held-out + 2 no-heal cases"]
  GAUNTLET --> DECISION{"All critical checks pass?"}

  DECISION -->|"No"| HOLD
  DECISION -->|"Yes"| CERT["Digest-bound Repair Certificate"]
  CERT --> CANARY["Canary activation"]
  CANARY --> VERIFY["Return to normal verification"]
```

## One-minute narration

### 0:00–0:10 — Meet the problem

> “Kevlar verifies web data before release. Nova costs 129 dollars, but when a scraper reports its 10.75 monthly plan as the price, Kevlar stops it.”

### 0:10–0:25 — The quiet failure

> “Nothing crashes; the JSON is valid. But a false price-drop alert is ready to ship. Kevlar sits in the middle and asks: does this number still mean purchase price?”

### 0:25–0:42 — Follow the evidence

> “Bright Data's custom Browser worker collects the page and brings back typed fields, visible text, JSON-LD, API data, and a screenshot. Kevlar treats that bundle as evidence, not truth, and releases only verified facts to apps and AI.”

### 0:42–1:00 — Build the safety net

> “When those signals disagree, Kevlar quarantines 10.75 and keeps the last trusted 129 available. Bright Data proposes a repair, but it still faces human review, held-out tests, negative controls, and a certificate before anything ships.”

## Three ideas the judge should remember

1. **A successful scrape is not automatically true.** Kevlar verifies semantic meaning before release.
2. **Bright Data is central.** Its custom Scraper Studio collector performs acquisition, structured extraction, evidence capture, and the repair workflow.
3. **A self-heal is still untrusted.** It must pass human review, held-out tests, negative controls, and certification before canary activation.

## Closing line

> **Bright Data keeps collectors alive. Kevlar keeps the facts honest.**
