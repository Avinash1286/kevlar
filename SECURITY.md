# Security policy

Please report vulnerabilities privately through GitHub's security advisory flow. Do not open a public issue for a suspected vulnerability or exposed credential.

Kevlar handles public web data, but its service credentials, API keys, webhook secrets, raw evidence, and tenant data are private. Never commit `.env` files, access tokens, live collector responses containing private data, or unredacted logs.

The initial supported version is the latest release on `main`. Security reports should include impact, reproduction steps, and any suggested containment.
