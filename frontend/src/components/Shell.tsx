import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  IconDatabaseZap,
  IconGrid,
  IconLogOut,
  IconMegaphone,
  IconMessageCircle,
  IconPlug,
  IconSettings,
  IconShoppingBag,
  IconTarget,
  IconTrendingUp,
  IconUsers,
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

export function Shell() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <IconTrendingUp size={15} />
          </div>
          <div className="brand-name">Apicem</div>
        </div>

        <NavItem to="/assistant" icon={<IconMessageCircle size={16} />} label="Ask Apicem" />

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
        <Outlet />
      </div>
    </div>
  );
}
