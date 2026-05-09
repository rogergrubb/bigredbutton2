"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/chat";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const supabase = createClient();

  async function emailPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setInfo("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function magicLink() {
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setInfo("Magic link sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send magic link");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth failed");
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-full bg-brb-red shadow-red-glow flex items-center justify-center font-black text-white">
          BRB
        </div>
      </div>
      <h1 className="text-3xl font-black text-center mb-2">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="text-center text-brb-muted mb-8">
        {mode === "signup" ? "Press the button. We'll handle the rest." : "Press the button to keep going."}
      </p>

      <form onSubmit={emailPassword} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          required
          className="w-full px-4 py-3 rounded-lg bg-brb-surface border border-brb-border text-brb-text focus:border-brb-red focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ chars)"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={8}
          required
          className="w-full px-4 py-3 rounded-lg bg-brb-surface border border-brb-border text-brb-text focus:border-brb-red focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 rounded-lg bg-brb-red hover:bg-brb-redHover disabled:opacity-50 transition text-white font-bold"
        >
          {busy ? "..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 h-px bg-brb-border" />
        <span className="text-xs text-brb-muted uppercase">or</span>
        <div className="flex-1 h-px bg-brb-border" />
      </div>

      <div className="space-y-2">
        <button
          onClick={google}
          disabled={busy}
          className="w-full py-3 rounded-lg border border-brb-border hover:border-brb-red transition text-brb-text font-medium disabled:opacity-50"
        >
          Continue with Google
        </button>
        <button
          onClick={magicLink}
          disabled={busy}
          className="w-full py-3 rounded-lg border border-brb-border hover:border-brb-red transition text-brb-text font-medium disabled:opacity-50"
        >
          Email me a magic link
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm text-brb-red text-center">{error}</p>
      )}
      {info && (
        <p className="mt-4 text-sm text-green-400 text-center">{info}</p>
      )}

      <p className="mt-8 text-center text-sm text-brb-muted">
        {mode === "signup" ? (
          <>Already have an account? <Link href="/login" className="text-brb-red hover:underline">Sign in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="text-brb-red hover:underline">Create an account</Link></>
        )}
      </p>
    </div>
  );
}
