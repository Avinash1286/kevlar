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

### 0:00–0:10 — Core idea

> “Kevlar is a verification firewall for web data. Example: the page price is 129 dollars, but a scraper reads 10.75 financing; Kevlar blocks it.”

### 0:10–0:25 — Concrete failure

> “Both values are valid numbers in valid JSON, so schema checks see no error. Kevlar compares the field's meaning with visible text, JSON-LD, and the public API before release.”

### 0:25–0:42 — Bright Data and the release gate

> “Bright Data Scraper Studio Browser workers navigate, extract typed data, capture evidence, and propose repairs. Kevlar treats every row as untrusted, checks meaning, quarantines unsafe observations, and keeps the labelled 129-dollar last-known-good fact available.”

### 0:42–1:00 — Repair and delivery

> “A repair cannot ship immediately. It faces Tribunal checks, human approval, held-out tests, negative controls, and a digest-bound certificate. Verified facts and events then reach REST, signed webhooks, the TypeScript SDK, read-only MCP, and a reviewed AI router.”

## Three ideas the judge should remember

1. **A successful scrape is not automatically true.** Kevlar verifies semantic meaning before release.
2. **Bright Data is central.** Its custom Scraper Studio collector performs acquisition, structured extraction, evidence capture, and the repair workflow.
3. **A self-heal is still untrusted.** It must pass human review, held-out tests, negative controls, and certification before canary activation.

## Closing line

> **Bright Data keeps collectors alive. Kevlar keeps the facts honest.**
