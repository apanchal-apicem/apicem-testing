import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BrandMark, ProductLabel } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuthStore } from "@/stores/auth";

const SEEDED_EMAIL = "jordan@apicemengine.com";

type Mode = "signin" | "forgot" | "sent";

export function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signIn = useAuthStore((s) => s.signIn);
  const [mode, setMode] = useState<Mode>("signin");
  const [resetEmail, setResetEmail] = useState(SEEDED_EMAIL);

  // Otherwise the browser's back button (or a stale bookmark, or the /login
  // history entry sign-in itself just pushed) can land a still-signed-in
  // user right back on this form — AppShell only guards the other
  // direction (signed out -> kicked to /login), so this route has to guard
  // itself rather than rely on how it was reached.
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6 py-12">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="h-9" />
          <ProductLabel className="mb-4 mt-2 text-[11.5px] tracking-[0.14em] text-accent-ink" />
          {mode === "signin" && (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Sign in to your workspace</h1>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">Your workspace is waiting on the other side.</p>
            </>
          )}
          {mode === "forgot" && (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Reset your password</h1>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">Enter your work email and we'll send you a reset link.</p>
            </>
          )}
          {mode === "sent" && (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Check your email</h1>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                If an account exists for <span className="font-medium text-ink">{resetEmail}</span>, a reset link is on its
                way.
              </p>
            </>
          )}
        </div>

        {mode === "signin" && (
          <form
            className="space-y-4 rounded-(--radius-lg) border border-border bg-surface p-6"
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
              navigate("/", { replace: true });
            }}
          >
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" defaultValue={SEEDED_EMAIL} required />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-[12.5px] font-medium text-accent-ink hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input id="password" type="password" defaultValue="••••••••••" required />
            </div>
            <Button type="submit" withArrow className="mt-2 w-full">
              Sign in
            </Button>
          </form>
        )}

        {mode === "forgot" && (
          <form
            className="space-y-4 rounded-(--radius-lg) border border-border bg-surface p-6"
            onSubmit={(e) => {
              e.preventDefault();
              setMode("sent");
            }}
          >
            <div>
              <Label htmlFor="reset-email">Work email</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" withArrow className="mt-2 w-full">
              Send reset link
            </Button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="w-full text-center text-[12.5px] font-medium text-accent-ink hover:underline"
            >
              Back to sign in
            </button>
          </form>
        )}

        {mode === "sent" && (
          <div className="rounded-(--radius-lg) border border-border bg-surface p-6">
            <Button type="button" className="w-full" onClick={() => setMode("signin")}>
              Back to sign in
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-[12.5px] text-ink-faint">
          This is a demo workspace running on fixture data; no real credentials required.
        </p>
      </div>
    </div>
  );
}
