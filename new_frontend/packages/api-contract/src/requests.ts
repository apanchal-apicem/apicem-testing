/**
 * Write-side shapes: what the frontend sends. These carry runtime zod
 * validation because they originate from user input — the backend should
 * run the same parse before trusting a request body.
 */
import { z } from "zod";

export const createWorkspaceInputSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

export const dataSourceTypeSchema = z.enum([
  "snowflake",
  "bigquery",
  "redshift",
  "postgres",
  "google_sheets",
  "shopify",
  "quickbooks",
  "stripe",
  "square",
]);

export const createDataSourceInputSchema = z.object({
  type: dataSourceTypeSchema,
  name: z.string().min(1).max(80),
  credentials: z.record(z.string(), z.string()),
});
export type CreateDataSourceInput = z.infer<typeof createDataSourceInputSchema>;

export const queryFilterSchema = z.object({
  column: z.string(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains"]),
  value: z.union([z.string(), z.number()]),
});
export type QueryFilter = z.infer<typeof queryFilterSchema>;

export const runQueryInputSchema = z.object({
  question: z.string().min(1).max(500).optional(),
  /** One or more metrics, no cap — a single id still resolves exactly as a lone metric always has; two or more asks the engine to combine them (see resolveQuery's doc comment in mock/fixtures.ts for how each combination of metric/dimension counts resolves). */
  metricIds: z.array(z.string()).min(1).optional(),
  /** Zero or more dimensions, no cap — two or more together cross-tab across all of them; every other combination just uses the first. */
  dimensions: z.array(z.string()).optional(),
  filters: z.array(queryFilterSchema).optional(),
  dateRange: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
});
export type RunQueryInput = z.infer<typeof runQueryInputSchema>;

/**
 * A real pivot query — Rows and Columns are independent shelves, not a
 * single `dimensions` list whose count decides the shape (that's
 * runQueryInputSchema's job, kept as-is for Ask/Build-manually). No cap on
 * how many metrics or dimensions go on any shelf: the actual safety limit
 * lives in the engine, on the *generated cell count* (rows x columns x
 * metrics) once real dimension cardinalities are known — a shelf holding a
 * lot of dimension ids is harmless by itself.
 */
export const runPivotQueryInputSchema = z.object({
  /** Empty is valid — the engine defaults to the workspace's first metric, same as picking 2 dimensions with no metric yet chosen in Build tab. */
  metricIds: z.array(z.string()).default([]),
  rowDimensions: z.array(z.string()).default([]),
  columnDimensions: z.array(z.string()).default([]),
});
export type RunPivotQueryInput = z.infer<typeof runPivotQueryInputSchema>;

export const reportBlockInputSchema = z.object({
  id: z.string(),
  type: z.enum(["kpi", "chart", "table", "pivot", "text", "divider", "image"]),
  layout: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  config: z.record(z.string(), z.unknown()),
});

export const createReportInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  folder: z.string().optional(),
});
export type CreateReportInput = z.infer<typeof createReportInputSchema>;

export const updateReportInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(400).optional(),
  blocks: z.array(reportBlockInputSchema).optional(),
});
export type UpdateReportInput = z.infer<typeof updateReportInputSchema>;

export const createWorkbookInputSchema = z.object({
  name: z.string().min(1).max(120),
  folder: z.string().optional(),
  query: z.object({
    source: z.enum(["metric", "preset"]),
    key: z.string(),
    question: z.string().max(500).optional(),
  }),
});
export type CreateWorkbookInput = z.infer<typeof createWorkbookInputSchema>;

const experimentGroupInputSchema = z.object({
  units: z.array(z.string()).min(1).max(200),
});

export const createExperimentInputSchema = z.object({
  name: z.string().min(1).max(120),
  hypothesis: z.string().min(1).max(500),
  metricId: z.string(),
  unitType: z.enum(["geo", "customer_segment"]),
  treatment: experimentGroupInputSchema,
  holdout: experimentGroupInputSchema,
  startDate: z.string(),
  endDate: z.string(),
});
export type CreateExperimentInput = z.infer<typeof createExperimentInputSchema>;

/** Every field optional — a save only ever sends the ones that changed. */
export const updateExperimentInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  hypothesis: z.string().min(1).max(500).optional(),
  metricId: z.string().optional(),
  unitType: z.enum(["geo", "customer_segment"]).optional(),
  treatment: experimentGroupInputSchema.optional(),
  holdout: experimentGroupInputSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type UpdateExperimentInput = z.infer<typeof updateExperimentInputSchema>;
