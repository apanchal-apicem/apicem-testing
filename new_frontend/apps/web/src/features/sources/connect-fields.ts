import type { DataSourceType } from "@apicem/api-contract";

export interface ConnectField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

export const connectFields: Record<DataSourceType, ConnectField[]> = {
  snowflake: [
    { key: "account", label: "Account identifier", placeholder: "xy12345.us-east-1" },
    { key: "warehouse", label: "Warehouse", placeholder: "ANALYTICS_WH" },
    { key: "username", label: "Username", placeholder: "readonly_svc" },
    { key: "password", label: "Password", placeholder: "••••••••••••", secret: true },
  ],
  bigquery: [
    { key: "projectId", label: "GCP project ID", placeholder: "northwind-analytics" },
    { key: "dataset", label: "Dataset", placeholder: "analytics_prod" },
    { key: "serviceAccountKey", label: "Service account key (JSON)", placeholder: "Paste key JSON", secret: true },
  ],
  redshift: [
    { key: "host", label: "Cluster endpoint", placeholder: "cluster.abc123.us-east-1.redshift.amazonaws.com" },
    { key: "database", label: "Database", placeholder: "analytics" },
    { key: "username", label: "Username", placeholder: "readonly_svc" },
    { key: "password", label: "Password", placeholder: "••••••••••••", secret: true },
  ],
  postgres: [
    { key: "host", label: "Host", placeholder: "db.northwind.supabase.co" },
    { key: "database", label: "Database", placeholder: "postgres" },
    { key: "username", label: "Username", placeholder: "readonly_svc" },
    { key: "password", label: "Password", placeholder: "••••••••••••", secret: true },
  ],
  google_sheets: [
    { key: "sheetUrl", label: "Sheet URL", placeholder: "https://docs.google.com/spreadsheets/d/…" },
  ],
  shopify: [
    { key: "storeDomain", label: "Store domain", placeholder: "northwind-outfitters.myshopify.com" },
    { key: "apiKey", label: "Admin API access token", placeholder: "shpat_••••••••••••", secret: true },
  ],
  square: [
    { key: "locationId", label: "Location ID", placeholder: "L2K3QZXABC" },
    { key: "accessToken", label: "Access token", placeholder: "EAAAE••••••••••••", secret: true },
  ],
  stripe: [{ key: "secretKey", label: "Secret key", placeholder: "sk_live_••••••••••••", secret: true }],
  quickbooks: [
    { key: "companyId", label: "Company (Realm) ID", placeholder: "9130354xxxxxxxxx" },
    { key: "clientId", label: "Client ID", placeholder: "ABCxyz123" },
    { key: "clientSecret", label: "Client secret", placeholder: "••••••••••••", secret: true },
  ],
};
