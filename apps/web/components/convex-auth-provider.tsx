"use client";

import { ConvexAuthProvider, useConvexAuth } from "@convex-dev/auth/react";
import { ConvexReactClient, useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, type ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = convexUrl ? new ConvexReactClient(convexUrl) : null;
const syncUser = makeFunctionReference<
  "mutation",
  Record<string, never>,
  unknown
>("phase11Access:syncCurrentUser");

function AuthUserSync() {
  const { isAuthenticated } = useConvexAuth();
  const sync = useMutation(syncUser);
  useEffect(() => {
    if (isAuthenticated) void sync({});
  }, [isAuthenticated, sync]);
  return null;
}

export function KevlarAuthProvider({ children }: { children: ReactNode }) {
  if (!client) return children;
  return (
    <ConvexAuthProvider client={client}>
      <AuthUserSync />
      {children}
    </ConvexAuthProvider>
  );
}
