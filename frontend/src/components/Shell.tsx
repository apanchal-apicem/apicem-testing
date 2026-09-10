import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { assetUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  IconDatabaseZap,
  IconGrid,
  IconLogOut,
  IconMegaphone,
  IconMenu,
  IconMessageCircle,
  IconMoon,
  IconPlug,
  IconSettings,
  IconShoppingBag,
  IconSun,
  IconTarget,
  IconTrendingUp,
  IconUsers,
  IconX,
} from "./icons";

function initials(name?: string, email?: string) {
  const source = name?.trim() || email || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
      {icon}
      {label}
    </NavLink>
  );
}

function currentTheme(): "light" | "dark" {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(currentTheme);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  return (
    <button className="secondary theme-toggle" style={{ width: "100%" }} onClick={toggle}>
      {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

export function Shell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // An off-canvas drawer left open across a navigation would sit on top of the page the
  // user just went to -- close it every time the route changes, same as any mobile nav.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}

      <div className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand">
          {user?.tenant_logo_url ? (
            <img src={assetUrl(user.tenant_logo_url)} alt="" className="brand-mark brand-mark-logo" />
          ) : (
            <div className="brand-mark">
              <IconTrendingUp size={15} />
            </div>
          )}
          <div className="brand-name">Apicem Engine</div>
          <button className="nav-close" aria-label="Close navigation" onClick={() => setNavOpen(false)}>
            <IconX size={18} />
          </button>
        </div>

        <NavItem to="/assistant" icon={<IconMessageCircle size={16} />} label="Ask Apicem Engine" />

        <div className="nav-section-label">Overview</div>
        <NavItem to="/dashboards/executive_overview" icon={<IconGrid size={16} />} label="Executive Overview" />

        <div className="nav-section-label">Sales</div>
        <NavItem to="/dashboards/revenue" icon={<IconTrendingUp size={16} />} label="Revenue" />
        <NavItem to="/dashboards/product_performance" icon={<IconShoppingBag size={16} />} label="Product Performance" />

        <div className="nav-section-label">Marketing</div>
        <NavItem to="/dashboards/marketing_performance" icon={<IconMegaphone size={16} />} label="Marketing Performance" />
        <NavItem to="/dashboards/advertising_roi" icon={<IconTarget size={16} />} label="Advertising ROI" />

        <div className="nav-section-label">Inventory</div>
        <NavItem to="/dashboards/inventory" icon={<IconDatabaseZap size={16} />} label="Inventory" />

        <div className="nav-section-label">Setup</div>
        <NavItem to="/connections" icon={<IconPlug size={16} />} label="Connections" />
        <NavItem to="/team" icon={<IconUsers size={16} />} label="Team" />
        <NavItem to="/account" icon={<IconSettings size={16} />} label="Account" />

        <div className="sidebar-footer">
          <ThemeToggle />
          <NavLink to="/account" className="user-row" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="avatar">{initials(user?.tenant_name, user?.email)}</div>
            <div className="user-row-text">
              <div className="name">{user?.tenant_name}</div>
              <div className="email">
                {user?.email} · <span style={{ textTransform: "capitalize" }}>{user?.role}</span>
              </div>
            </div>
          </NavLink>
          <button className="secondary" style={{ width: "100%" }} onClick={logout}>
            <IconLogOut size={15} />
            Log out
          </button>
        </div>
      </div>
      <div className="main-content">
        <button
          className="nav-hamburger"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          <IconMenu size={20} />
        </button>
        <Outlet />
      </div>
    </div>
  );
}
