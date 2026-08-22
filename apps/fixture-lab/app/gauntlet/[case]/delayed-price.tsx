"use client";

import { useEffect, useState } from "react";

export function DelayedPrice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  return visible ? (
    <strong
      aria-label="Purchase price 129 US dollars"
      data-testid="one-time-price"
    >
      $129.00
    </strong>
  ) : (
    <span data-delayed-price="pending">Loading one-time price…</span>
  );
}
