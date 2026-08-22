# Read-only MCP

Kevlar MCP exposes verified, released intelligence to agents. Every returned fact must retain its trust state, freshness, source IDs, evidence references, and certificate reference.

Initial tools are `kevlar_current_facts` and `kevlar_fact_history`. They read Kevlar's released records; they do not scrape arbitrary URLs. Repair approval, entity merging, secret access, and other write-capable operations are intentionally absent.

The production Streamable HTTP-compatible JSON-RPC endpoint is `https://kevlar-web.vercel.app/api/mcp`. Send the same bearer key used by the API; MCP access also requires `mcp:read`.
