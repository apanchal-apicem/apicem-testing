import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BrandMark, ProductLabel } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { apiClient, isMockMode } from "@/api/client";
import { signIn, signUp, useAppDispatch, useAppSelector } from "@/store";

const SEEDED_EMAIL = "jordan@apicemengine.com";

type Mode = "signin" | "signup" | "forgot" | "sent";

export function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const authStatus = useAppSelector((state) => state.auth.status);
  const [mode, setMode] = useState<Mode>("signin");
  const initialEmail = isMockMode ? SEEDED_EMAIL : "";
  const [resetEmail, setResetEmail] = useState(initialEmail);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Otherwise the browser's back button (or a stale bookmark, or the /login
  // history entry sign-in itself just pushed) can land a still-signed-in
  // user right back on this form — AppShell only guards the other
  // direction (signed out -> kicked to /login), so this route has to guard
  // itself rather than rely on how it was reached.
  if (authStatus === "authenticated") return <Navigate to="/" replace />;

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
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Sign in to your workspace
              </h1>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                Your workspace is waiting on the other side.
              </p>
            </>
          )}
          {mode === "signup" && (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Create your workspace
              </h1>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                Set up your workspace to get started.
              </p>
            </>
          )}
          {mode === "forgot" && (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Reset your password
              </h1>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                Enter your work email and we'll send you a reset link.
              </p>
            </>
          )}
          {mode === "sent" && (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Check your email
              </h1>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                If an account exists for{" "}
                <span className="font-medium text-ink">{resetEmail}</span>, a
                reset link is on its way.
              </p>
            </>
          )}
        </div>

        {(mode === "signin" || mode === "signup") && (
          <form
            className="space-y-4 rounded-(--radius-lg) border border-border bg-surface p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setIsSubmitting(true);
              try {
                if (mode === "signup") {
                  await dispatch(
                    signUp({ companyName, email, password }),
                  ).unwrap();
                  navigate("/onboarding", { replace: true });
                } else {
                  await dispatch(signIn({ email, password })).unwrap();
                  navigate("/", { replace: true });
                }
              } catch (submitError) {
                const message =
                  submitError &&
                  typeof submitError === "object" &&
                  "message" in submitError &&
                  typeof submitError.message === "string"
                    ? submitError.message
                    : "Unable to complete your request.";
                setError(message);
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {mode === "signup" && (
              <div>
                <Label htmlFor="company-name">Workspace name</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-[12.5px] font-medium text-accent-ink hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-[12.5px] text-danger">
                {error}
              </p>
            )}
            <Button
              type="submit"
              withArrow
              className="mt-2 w-full"
              loading={isSubmitting}
            >
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
        )}

        {(mode === "signin" || mode === "signup") && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode(mode === "signup" ? "signin" : "signup");
            }}
            className="mt-4 w-full text-center text-[12.5px] font-medium text-accent-ink hover:underline"
          >
            {mode === "signup"
              ? "Already have an account? Sign in"
              : "Create an account"}
          </button>
        )}

        {mode === "forgot" && (
          <form
            className="space-y-4 rounded-(--radius-lg) border border-border bg-surface p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setIsSubmitting(true);
              try {
                await apiClient.requestPasswordReset(resetEmail);
                setMode("sent");
              } catch {
                setError("Could not send a reset request. Please try again.");
              } finally {
                setIsSubmitting(false);
              }
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
            {error && (
              <p role="alert" className="text-[12.5px] text-danger">
                {error}
              </p>
            )}
            <Button
              type="submit"
              withArrow
              className="mt-2 w-full"
              loading={isSubmitting}
            >
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
            <Button
              type="button"
              className="w-full"
              onClick={() => setMode("signin")}
            >
              Back to sign in
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-[12.5px] text-ink-faint">
          {isMockMode
            ? "Demo mode uses fixture data; any sign-in credentials work."
            : mode === "signup"
              ? "Your password is protected by your Apicem session."
              : "Sign in to your Apicem workspace."}
        </p>
      </div>
    </div>
  );
}
