"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Something went wrong");
        router.push("/");
        router.refresh();
      })
      .catch((err: Error) => {
        setError(err.message);
        setSubmitting(false);
      });
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-sm border border-hairline bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground font-serif text-sm italic text-background">
            t
          </span>
          <h1 className="font-serif text-lg italic tracking-tight">tutee</h1>
        </div>
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted">
          {mode === "login" ? "Log in" : "Create an account"}
        </p>
        <h2 className="mb-6 font-serif text-2xl italic">
          {mode === "login" ? "Welcome back." : "Start learning."}
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="rounded-sm border border-hairline bg-black/[0.02] p-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="rounded-sm border border-hairline bg-black/[0.02] p-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
          />
          {error && <p className="text-sm text-[#b8791f]">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className="mt-2 rounded-sm border border-hairline px-4 py-2 text-sm uppercase tracking-wide transition-colors hover:border-foreground/40 hover:bg-black/5 disabled:opacity-40"
          >
            {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>
        <p className="mt-6 text-sm text-muted">
          {mode === "login" ? (
            <>
              Need an account? <Link href="/signup" className="underline underline-offset-2">Sign up</Link>
            </>
          ) : (
            <>
              Already have one? <Link href="/login" className="underline underline-offset-2">Log in</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
