export const queryKeys = {
  me: ["me"] as const,
  workspace: ["workspace"] as const,
  myWorkspaces: ["my-workspaces"] as const,
  members: ["members"] as const,
  dataSources: ["data-sources"] as const,
  schema: (sourceId: string) => ["data-sources", sourceId, "schema"] as const,
  syncRuns: (sourceId: string) =>
    ["data-sources", sourceId, "sync-runs"] as const,
  metrics: ["metrics"] as const,
  starterQuestions: ["starter-questions"] as const,
  workbooks: ["workbooks"] as const,
  workbook: (id: string) => ["workbooks", id] as const,
  reports: ["reports"] as const,
  report: (id: string) => ["reports", id] as const,
  experiments: ["experiments"] as const,
  experiment: (id: string) => ["experiments", id] as const,
};
