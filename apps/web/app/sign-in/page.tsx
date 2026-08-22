"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

function ConfiguredSignIn() {
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const form = new FormData(event.currentTarget); form.set("flow", mode);
    try { await signIn("password", form); setMessage("Session established. Operator permissions are resolved server-side."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Authentication failed."); }
    finally { setPending(false); }
  }

  return isAuthenticated ? <article><span>SESSION ACTIVE</span><h2>You are signed in.</h2><p>Your organization role is checked again on every protected Convex function.</p><button onClick={() => void signOut()}>Sign out</button></article> : <form onSubmit={submit}>
        <span>{mode === "signIn" ? "SIGN IN" : "CREATE ACCOUNT"}</span>
        <label>Email<input required type="email" name="email" autoComplete="email" /></label>
        <label>Password<input required minLength={12} type="password" name="password" autoComplete={mode === "signIn" ? "current-password" : "new-password"} /></label>
        <button disabled={pending || isLoading}>{pending ? "Authenticating…" : mode === "signIn" ? "Sign in" : "Create account"}</button>
        <button className="text-button" type="button" onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>{mode === "signIn" ? "Need an account?" : "Already have an account?"}</button>
        {message ? <p role="status">{message}</p> : null}
      </form>;
}

export default function SignInPage() {
  const authConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  return <main className="console-shell auth-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/security">Security</Link><Link href="/operations">Operations</Link></nav></header>
    <section className="auth-panel">
      <div><span>ORGANIZATION ACCESS</span><h1>Authenticate before you change trust policy.</h1><p>Reading public proof is separate from approving repairs, sources, merges, conflicts, API keys, or router configuration.</p></div>
      {authConfigured ? <ConfiguredSignIn /> : <article><span>AUTH NOT CONFIGURED</span><h2>Public proof remains available.</h2><p>Set NEXT_PUBLIC_CONVEX_URL to enable operator sign-in for this deployment.</p></article>}
    </section>
  </main>;
}
