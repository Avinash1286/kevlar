# ADR-011: Integrity digests are not digital signatures

## Status

Accepted for v1.0.0.

## Context

SHA-256 digests can bind a certificate or evidence manifest to content and reveal later modification. A digest alone does not establish signer identity, key possession, non-repudiation, or trusted timestamping.

## Decision

Call content hashes **integrity digests**, never digital signatures. Documentation and UI may claim reproducible content integrity when the digest is recomputed, but may not claim cryptographic authorship or third-party authenticity.

## Alternatives

- Describe every hash as a signature.
- Omit integrity hashes until full signing exists.
- Add ad hoc signing keys without lifecycle management.

## Consequences

The release makes a narrow claim that the implementation can support. Users must rely on surrounding authenticated storage and audit controls for origin; digest verification alone is not proof of who issued an artifact.

## Reversal conditions

Use “digital signature” only after implementing a defined signing format, protected key generation and storage, rotation and revocation, signer identity, verification tooling, timestamp policy, and operational recovery, all covered by tests and documentation.
