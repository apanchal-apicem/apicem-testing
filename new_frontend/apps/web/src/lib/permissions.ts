import type { Role } from "@apicem/api-contract";

/**
 * Whether this role can edit or delete workspace content (reports,
 * explorations, experiments) — the one boundary "Viewer" exists to enforce.
 * A single shared predicate rather than an inlined `role !== "viewer"` at
 * every call site, so the actual rule ("everyone but Viewer") lives in one
 * place if it ever needs to change (say, restricting delete to Admin+).
 */
export function canManageContent(role: Role | undefined): boolean {
  return role != null && role !== "viewer";
}
