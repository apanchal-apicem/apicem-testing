import {
  Banknote,
  Boxes,
  CreditCard,
  Database,
  type LucideIcon,
  Server,
  ShoppingBag,
  Snowflake,
  Square,
  Table,
} from "lucide-react";
import type { DataSourceType } from "@apicem/api-contract";

export interface SourceTypeMeta {
  type: DataSourceType;
  label: string;
  description: string;
  icon: LucideIcon;
  category: "Warehouse" | "Commerce" | "Finance" | "Spreadsheet";
}

export const sourceTypes: SourceTypeMeta[] = [
  { type: "snowflake", label: "Snowflake", description: "Query your warehouse directly, read-only.", icon: Snowflake, category: "Warehouse" },
  { type: "bigquery", label: "BigQuery", description: "Connect a Google Cloud project and dataset.", icon: Boxes, category: "Warehouse" },
  { type: "redshift", label: "Redshift", description: "Connect an AWS Redshift cluster.", icon: Server, category: "Warehouse" },
  { type: "postgres", label: "Postgres", description: "Any Postgres-compatible database, including Supabase.", icon: Database, category: "Warehouse" },
  { type: "shopify", label: "Shopify", description: "Orders, products, and customers from your storefront.", icon: ShoppingBag, category: "Commerce" },
  { type: "square", label: "Square", description: "In-person and online sales from Square.", icon: Square, category: "Commerce" },
  { type: "stripe", label: "Stripe", description: "Charges, refunds, and subscriptions.", icon: CreditCard, category: "Finance" },
  { type: "quickbooks", label: "QuickBooks Online", description: "Invoices, expenses, and the general ledger.", icon: Banknote, category: "Finance" },
  { type: "google_sheets", label: "Google Sheets", description: "Bring in a spreadsheet as a live source.", icon: Table, category: "Spreadsheet" },
];

export function getSourceMeta(type: DataSourceType): SourceTypeMeta {
  return sourceTypes.find((s) => s.type === type)!;
}
