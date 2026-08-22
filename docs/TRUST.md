# Trust and release model

Kevlar stores acquisition, belief, and release as separate states. A schema-valid collector output is only an observation. Deterministic mapping creates candidate fields; source and evidence policy decide whether a candidate can become a fact; semantic CDC decides whether a released fact warrants a business event.

Critical failure handling is fail-closed:

1. deterministic rules classify the failure;
2. the suspect value is quarantined;
3. the last released fact remains available with an explicit freshness label;
4. repair output is treated as an untrusted proposal;
5. the Tribunal checks contract, independent evidence, selector risk, and human authority;
6. the Gauntlet runs visible, held-out, and negative-control cases;
7. only a complete pass can issue a digest-bound certificate and resume release.

Source disagreement opens a conflict instead of averaging values. A missing source does not delete a fact. AI can diagnose, propose mappings, or propose router changes, but it cannot approve repairs, merge identities, release facts, or activate production routes.

Evidence references and hashes are retained on released facts and events. Full page bodies and screenshots are subject to shorter retention because they are larger and may contain unrelated content.
