"use client";

import { useEffect, useState } from "react";

export function PublicApiProbe() {
  const [state, setState] = useState<"loading" | "available" | "unavailable">(
    "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public-product/nova", { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error("Public evidence endpoint unavailable");
        setState("available");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setState("unavailable");
      });
    return () => controller.abort();
  }, []);

  return (
    <span className={`api-state api-${state}`}>
      Public product API · {state}
    </span>
  );
}
