import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FlaskConical, Plug, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkbookCard } from "@/features/workbooks/workbook-card";
import { SourceSummaryList } from "@/features/sources/source-summary-list";
import { StarterQuestionsList } from "@/features/ask/starter-questions-list";
import { ExperimentSummaryList } from "@/features/experiments/experiment-summary-list";
import { useCurrentUser, useDataSources, useExperiments, useStarterQuestions, useTeamMembers, useWorkbooks } from "@/api/hooks";

export function HomePage() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: workbooks = [] } = useWorkbooks();
  const { data: members = [] } = useTeamMembers();
  const { data: sources = [] } = useDataSources();
  const { data: starterQuestions = [] } = useStarterQuestions();
  const { data: experiments = [] } = useExperiments();
  const [filter, setFilter] = useState<"all" | "workbook" | "report">("all");

  const filtered = workbooks.filter((w) => filter === "all" || w.kind === filter);
  const firstName = user?.name.split(" ")[0];

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title={firstName ? `Good to see you, ${firstName}` : "Home"}
        description="Everything your team has explored, measured, and shipped, all in one place."
      />

      <button
        onClick={() => navigate("/explore")}
        className="mb-8 flex w-full items-center gap-3 rounded-(--radius-lg) border border-border bg-surface px-4 py-2.5 text-left transition-colors hover:border-accent"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Sparkles className="size-3.5" />
        </span>
        <span className="flex-1 text-[13.5px] text-ink-faint">Ask a question about your business…</span>
        <ArrowRight className="size-4 text-ink-faint" />
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="scrollbar-thin mb-4 overflow-x-auto">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="workbook">Explorations</TabsTrigger>
                <TabsTrigger value="report">Reports</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((wb) => (
              <WorkbookCard key={wb.id} workbook={wb} owner={members.find((m) => m.id === wb.ownerId)} />
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <Card>
            <div className="flex items-center justify-between p-4 pb-2">
              <h2 className="font-display text-[13.5px] font-semibold text-ink">Experiments</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/experiments")} className="h-7 px-2 text-[12px]">
                View all
              </Button>
            </div>
            <div className="px-2 pb-2">
              {experiments.length > 0 ? (
                <ExperimentSummaryList experiments={experiments.slice(0, 3)} />
              ) : (
                <EmptyState
                  icon={FlaskConical}
                  title="No experiments yet"
                  description="Test a real causal lift, not just a dashboard trend."
                  className="border-0 py-6"
                />
              )}
            </div>
            <div className="border-t border-border p-3">
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/experiments")}>
                <FlaskConical className="size-3.5" />
                New experiment
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between p-4 pb-2">
              <h2 className="font-display text-[13.5px] font-semibold text-ink">Data sources</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/connections")} className="h-7 px-2 text-[12px]">
                View all
              </Button>
            </div>
            <div className="px-2 pb-2">
              <SourceSummaryList sources={sources.slice(0, 4)} />
            </div>
            <div className="border-t border-border p-3">
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/connections/new")}>
                <Plug className="size-3.5" />
                Connect a source
              </Button>
            </div>
          </Card>

          <Card>
            <div className="p-4 pb-2">
              <h2 className="font-display text-[13.5px] font-semibold text-ink">Starter questions</h2>
            </div>
            <div className="px-2 pb-3">
              {starterQuestions.length > 0 ? (
                <StarterQuestionsList
                  questions={starterQuestions}
                  onSelect={(q) => navigate(`/explore?q=${encodeURIComponent(q)}`)}
                />
              ) : (
                <p className="px-2.5 py-2 text-[12.5px] text-ink-faint">
                  Connect a source to get suggested questions.
                </p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
