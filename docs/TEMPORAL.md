# Bitemporal facts and semantic events

Each fact version records two clocks:

- valid time: when the value applies in the outside world;
- transaction time: when Kevlar learned or changed its belief.

Corrections append a new version linked to the earlier belief; they do not rewrite history. `currentFacts` is a rebuildable materialized projection, while `factVersions`, release decisions, observations, evidence hashes, and version relations remain the audit source of truth.

Semantic CDC compares normalized values with predicate-specific equivalence rules. Layout drift may create an audit event but cannot create a price-change business event. Verified external changes, corrections, conflicts, renames, and deprecations receive deterministic event IDs so retries do not duplicate downstream effects.

Absence alone never means deletion. Removal requires explicit evidence, the configured independent-source rule, and human approval when policy marks the predicate as material.
