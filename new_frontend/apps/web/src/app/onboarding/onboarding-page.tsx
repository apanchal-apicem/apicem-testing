import { useNavigate } from "react-router-dom";
import { Compass, FlaskConical, LayoutDashboard, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const steps = [
  {
    n: "01",
    icon: Plug,
    title: "Connect a source",
    body: "Link a warehouse, storefront, or spreadsheet. Credentials are read-only and isolated to this workspace.",
    cta: "Connect a source",
    to: "/connections/new",
  },
  {
    n: "02",
    icon: Compass,
    title: "Explore your data",
    body: "Ask a plain-language question, or drag fields onto a shelf to build a view by hand.",
    cta: "Start exploring",
    to: "/explore",
  },
  {
    n: "03",
    icon: FlaskConical,
    title: "Test it for real",
    body: "Found something interesting? Split a treatment and holdout group to measure its actual causal lift, not just its correlation.",
    cta: "Design an experiment",
    to: "/experiments",
  },
  {
    n: "04",
    icon: LayoutDashboard,
    title: "Build a report",
    body: "Turn what you find into a pixel-perfect, drag-and-drop report you can share with the team.",
    cta: "Open report builder",
    to: "/reports?new=1",
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();

  function continueTo(path: string) {
    window.localStorage.setItem("apicem.onboardingComplete", "1");
    navigate(path);
  }

  return (
    <div className="min-h-dvh bg-bg px-6 py-12">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto max-w-3xl">
        <p className="text-center text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent-ink">
          Welcome to Apicem Engine
        </p>
        <h1 className="mt-2 text-center font-display text-[28px] font-bold tracking-tight text-ink text-balance">
          Four steps to your first proven answer
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-[14px] text-ink-soft">
          Northwind Outfitters is set up with fixture data so you can try the
          whole loop before connecting anything real.
        </p>

        <div className="mt-10 space-y-4">
          {steps.map((step) => (
            <div
              key={step.n}
              className="flex flex-col gap-4 rounded-(--radius-lg) border border-border bg-surface p-5 sm:flex-row sm:items-center sm:gap-5"
            >
              <div className="flex items-center gap-4 sm:gap-5">
                <span className="font-display text-2xl font-bold text-border-strong">
                  {step.n}
                </span>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                  <step.icon className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-semibold text-ink">
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {step.body}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                withArrow
                className="w-full shrink-0 sm:w-auto"
                onClick={() => continueTo(step.to)}
              >
                {step.cta}
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => continueTo("/")}
            className="text-[13px] font-medium text-ink-faint hover:text-ink"
          >
            Skip, take me straight to the workspace
          </button>
        </div>
      </div>
    </div>
  );
}
