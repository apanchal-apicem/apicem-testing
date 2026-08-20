import type { ReactNode } from "react";
import { IconBuilding, IconMegaphone, IconShoppingBag, IconTarget } from "./components/icons";

export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

export interface SourceTypeConfig {
  id: string;
  label: string;
  icon: (size?: number) => ReactNode;
  credentialFields: CredentialField[];
}

export const SOURCE_TYPES: SourceTypeConfig[] = [
  {
    id: "shopify",
    label: "Shopify",
    icon: (size = 16) => <IconShoppingBag size={size} />,
    credentialFields: [
      { key: "shop_domain", label: "Shop domain", placeholder: "your-store.myshopify.com" },
      { key: "access_token", label: "Admin API access token", secret: true },
    ],
  },
  {
    id: "google_ads",
    label: "Google Ads",
    icon: (size = 16) => <IconMegaphone size={size} />,
    credentialFields: [
      { key: "customer_id", label: "Customer ID", placeholder: "123-456-7890" },
      { key: "developer_token", label: "Developer token", secret: true },
      { key: "client_id", label: "OAuth client ID", secret: true },
      { key: "client_secret", label: "OAuth client secret", secret: true },
      { key: "refresh_token", label: "OAuth refresh token", secret: true },
    ],
  },
  {
    id: "meta_ads",
    label: "Meta Ads",
    icon: (size = 16) => <IconTarget size={size} />,
    credentialFields: [
      { key: "ad_account_id", label: "Ad account ID", placeholder: "act_1234567890" },
      { key: "access_token", label: "Access token", secret: true },
    ],
  },
  {
    id: "netsuite",
    label: "NetSuite",
    icon: (size = 16) => <IconBuilding size={size} />,
    credentialFields: [
      { key: "account_id", label: "Account ID", placeholder: "1234567_SB1" },
      { key: "consumer_key", label: "Consumer key", secret: true },
      { key: "consumer_secret", label: "Consumer secret", secret: true },
      { key: "token_id", label: "Token ID", secret: true },
      { key: "token_secret", label: "Token secret", secret: true },
    ],
  },
];

export function sourceTypeConfig(id: string): SourceTypeConfig | undefined {
  return SOURCE_TYPES.find((s) => s.id === id);
}
