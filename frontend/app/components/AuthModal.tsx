"use client";

import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { cn } from "../lib/utils";

/* ═══════════════════════════════════════════════════════════════
   AuthModal — Login / Register Modal
   ═══════════════════════════════════════════════════════════════ */

export function AuthModal() {
  const { isModalOpen, closeModal, login, register } = useAuthStore();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isModalOpen) return null;

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const switchTab = (t: "login" | "register") => {
    setTab(t);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    if (tab === "register") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (!/[a-zA-Z]/.test(password)) {
        setError("Password must contain at least one letter");
        return;
      }
      if (!/[0-9]/.test(password)) {
        setError("Password must contain at least one number");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
      resetForm();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Something went wrong";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={closeModal}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm mx-4 bg-bp-bg-secondary border border-bp-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeModal}
          className="absolute top-3 right-3 p-1 text-bp-text-tertiary hover:text-bp-text-primary transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Tabs */}
        <div className="flex border-b border-bp-border">
          <button
            onClick={() => switchTab("login")}
            className={cn(
              "flex-1 py-3.5 text-sm font-medium transition-colors relative",
              tab === "login"
                ? "text-bp-text-primary"
                : "text-bp-text-tertiary hover:text-bp-text-secondary"
            )}
          >
            Log In
            {tab === "login" && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] bg-bp-text-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => switchTab("register")}
            className={cn(
              "flex-1 py-3.5 text-sm font-medium transition-colors relative",
              tab === "register"
                ? "text-bp-text-primary"
                : "text-bp-text-tertiary hover:text-bp-text-secondary"
            )}
          >
            Sign Up
            {tab === "register" && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] bg-bp-text-primary rounded-full" />
            )}
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Error */}
          {error && (
            <div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md">
              {error}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs text-bp-text-tertiary mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full bg-bp-bg-input border border-bp-border rounded-md px-3 py-2.5 text-sm text-bp-text-primary placeholder-bp-text-disabled focus:outline-none focus:border-bp-border-active transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs text-bp-text-tertiary mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === "register" ? "Min 8 chars, 1 letter, 1 number" : "••••••••"}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              className="w-full bg-bp-bg-input border border-bp-border rounded-md px-3 py-2.5 text-sm text-bp-text-primary placeholder-bp-text-disabled focus:outline-none focus:border-bp-border-active transition-colors"
            />
          </div>

          {/* Confirm Password (register only) */}
          {tab === "register" && (
            <div>
              <label className="block text-xs text-bp-text-tertiary mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full bg-bp-bg-input border border-bp-border rounded-md px-3 py-2.5 text-sm text-bp-text-primary placeholder-bp-text-disabled focus:outline-none focus:border-bp-border-active transition-colors"
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-2.5 rounded-md text-sm font-semibold transition-all",
              loading && "opacity-50 cursor-not-allowed",
              "bg-bp-text-primary text-bp-text-inverse hover:opacity-90"
            )}
          >
            {loading
              ? "Please wait..."
              : tab === "login"
                ? "Log In"
                : "Create Account"}
          </button>

          {/* Footer */}
          <p className="text-center text-xs text-bp-text-tertiary">
            {tab === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchTab("register")}
                  className="text-bp-text-primary hover:underline font-medium"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchTab("login")}
                  className="text-bp-text-primary hover:underline font-medium"
                >
                  Log in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
