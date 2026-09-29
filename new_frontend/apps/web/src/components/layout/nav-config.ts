import type { LucideIcon } from "lucide-react";
import { Compass, Database, FlaskConical, Home, LayoutDashboard, Settings } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const primaryNav: NavItem[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Explore", to: "/explore", icon: Compass },
  { label: "Experiments", to: "/experiments", icon: FlaskConical },
  { label: "Reports", to: "/reports", icon: LayoutDashboard },
  { label: "Connections", to: "/connections", icon: Database },
];

export const secondaryNav: NavItem[] = [{ label: "Settings", to: "/settings", icon: Settings }];
