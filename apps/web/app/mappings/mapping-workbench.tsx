"use client";

import { useState } from "react";

const transforms = [
  "rename",
  "trim",
  "normalize_whitespace",
  "normalize_identifier",
  "parse_number",
  "unit_convert",
  "enum_map",
  "split",
  "combine",
  "default",
] as const;

type Transform = (typeof transforms)[number];

function preview(value: string, transform: Transform) {
  if (transform === "trim") return value.trim();
  if (transform === "normalize_whitespace") return value.replace(/\s+/g, " ").trim();
  if (transform === "normalize_identifier") {
    return value
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  if (transform === "parse_number") {
    const parsed = Number(value.replaceAll(",", "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? String(parsed) : "invalid numeric input";
  }
  if (transform === "unit_convert") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? `${parsed * 1_000_000} USD / million tokens` : "invalid unit input";
  }
  if (transform === "split") return value.split(/[,/]/)[0]?.trim() ?? "";
  if (transform === "combine") return value.split("+").map((item) => item.trim()).join(":");
  if (transform === "default") return value.trim() || "unknown";
  if (transform === "enum_map") return value.trim().toLowerCase();
  return value;
}

export function MappingWorkbench() {
  const [source, setSource] = useState("records[].provider_model_id");
  const [target, setTarget] = useState("model.provider_model_id");
  const [transform, setTransform] = useState<Transform>("normalize_identifier");
  const [sample, setSample] = useState(" GPT 5.6 Sol ");
  const result = preview(sample, transform);
  const draft = JSON.stringify({ target, source, transforms: [{ name: transform }] }, null, 2);

  return (
    <section className="mapping-workbench" aria-labelledby="mapping-workbench-title">
      <header>
        <div>
          <span>SAFE DRAFT WORKBENCH</span>
          <h2 id="mapping-workbench-title">Source → canonical rule</h2>
        </div>
        <span className="state-pill stale">DRAFT ONLY</span>
      </header>
      <p>
        The browser can draft and preview allow-listed transforms. Activation still requires fixture tests,
        shadow parity, and a server-side approval.
      </p>
      <div className="mapping-form-grid">
        <label>
          Source path
          <input value={source} onChange={(event) => setSource(event.target.value)} />
        </label>
        <label>
          Canonical target
          <input value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label>
          Deterministic transform
          <select value={transform} onChange={(event) => setTransform(event.target.value as Transform)}>
            {transforms.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Stored sample value
          <input value={sample} onChange={(event) => setSample(event.target.value)} />
        </label>
      </div>
      <div className="mapping-preview">
        <div>
          <span>BEFORE</span>
          <code>{sample}</code>
        </div>
        <b>→</b>
        <div>
          <span>AFTER</span>
          <code>{result}</code>
        </div>
      </div>
      <details>
        <summary>Deterministic draft JSON</summary>
        <pre>{draft}</pre>
      </details>
      <small>Opaque generated code is structurally rejected by the mapping specification validator.</small>
    </section>
  );
}
