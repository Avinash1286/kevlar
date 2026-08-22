"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthBoundary({ children, label = "Operator controls" }: { children: ReactNode; label?: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <div className="auth-boundary"><span>VERIFYING SESSION</span></div>;
  if (!isAuthenticated) return <div className="auth-boundary"><div><span>AUTHENTICATION REQUIRED</span><h3>{label}</h3><p>High-impact actions require an organization role and project membership.</p></div><Link href="/sign-in">Sign in →</Link></div>;
  return children;
}
