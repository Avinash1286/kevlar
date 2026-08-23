# Verified release walkthroughs

The release includes two reproducible, silent walkthrough recordings generated from the production deployment:

- `artifacts/demo/kevlar-core-v1.0.1.webm` covers the trust kernel, Gauntlet, repair queue, verified feed, and evidence.
- `artifacts/demo/kevlar-full-platform-v1.0.1.webm` covers sources, entities, bitemporal history, semantic events, conflicts, developer delivery, the verified-event router, operations, and security.
- `artifacts/demo/kevlar-hackathon-submission-v1.0.1.mp4` is the captioned, narrated, YouTube-compatible 45.44-second automated walkthrough; its sidecar captions are in the matching `.en.srt` file.

Final MP4 verification: H.264 video, AAC 48 kHz stereo audio, 1440x900,
3,495,967 bytes, full decode passed, mean audio -20.5 dB, peak -1.2 dB, and
SHA-256 `f9ba63f7d41291d77413d91aaf046e8358685f8b9b4b1cd2c43c9e09cff1104e`.

Regenerate both with `pnpm release:demo`. The browser script visits only public production routes and does not contain credentials.

Display only the committed values in `benchmarks/results/v1.0.1.json` and `benchmarks/results/v1.0.1-load.json`; do not extrapolate them beyond the controlled fixture and the measured production request batch.
