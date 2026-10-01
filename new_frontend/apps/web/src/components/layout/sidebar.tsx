import { useState, type PointerEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Building2,
  Check,
  ChevronsLeft,
  ChevronsRight,
  FilePlus2,
  FlaskConical,
  Plug,
  Plus,
  Sparkles,
} from "lucide-react";
import { primaryNav, secondaryNav } from "./nav-config";
import { BrandMark, ProductLabel } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreateWorkspaceDialog } from "@/features/workspaces/create-workspace-dialog";
import {
  useCurrentUser,
  useCurrentWorkspace,
  useMyWorkspaces,
  useSwitchWorkspace,
} from "@/api/hooks";
import { queryClient } from "@/api/query-client";
import { prefetchRoute } from "@/route-prefetch";
import {
  signOut,
  sidebarActions,
  useAppDispatch,
  useAppSelector,
} from "@/store";
import { cn } from "@/lib/utils";

function NavRow({
  label,
  to,
  icon: Icon,
  collapsed,
}: {
  label: string;
  to: string;
  icon: typeof Sparkles;
  collapsed?: boolean;
}) {
  const link = (
    <NavLink
      to={to}
      end={to === "/"}
      aria-label={collapsed ? label : undefined}
      onFocus={() => prefetchRoute(to, queryClient)}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-(--radius-sm) px-3 py-2 text-[13.5px] font-medium transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-primary text-primary-ink"
            : "text-ink-soft hover:bg-surface-2 hover:text-ink",
        )
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={2} />
      {!collapsed && label}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

const roleLabel: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

/**
 * The actual nav — brand mark, New menu, links, workspace switcher, theme
 * toggle, account menu. Split out from `Sidebar` so the same content can
 * render inside the always-visible desktop rail *or* inside
 * `MobileNavDrawer`'s slide-over, without duplicating a single link, menu
 * item, or (now) workspace switcher between the two.
 *
 * `collapsed` only ever comes from the desktop `Sidebar` — the mobile drawer
 * is an on-demand overlay, not a persistent rail competing for width, so it
 * always renders this expanded regardless of the desktop preference.
 */
export function SidebarContent({
  collapsed = false,
  clickToToggle = false,
}: {
  collapsed?: boolean;
  /** Desktop-only: lets clicking empty space in the rail toggle collapse, same as the chevron button. */
  clickToToggle?: boolean;
}) {
  const { data: workspace } = useCurrentWorkspace();
  const { data: user } = useCurrentUser();
  const { data: myWorkspaces = [] } = useMyWorkspaces();
  const switchWorkspace = useSwitchWorkspace();
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const sidebarCollapsed = useAppSelector((state) => state.sidebar.collapsed);

  function toggleCollapsed() {
    const next = !sidebarCollapsed;
    window.localStorage.setItem("apicem.sidebarCollapsed", next ? "1" : "0");
    dispatch(sidebarActions.setSidebarCollapsed(next));
  }

  function handleSwitch(workspaceId: string) {
    if (workspaceId === workspace?.id) return;
    // A switch (or a create, which also switches) can leave a deep-linked
    // resource id — a report, an experiment — that doesn't exist in the
    // workspace just switched into. Home always exists.
    switchWorkspace.mutate(workspaceId, { onSuccess: () => navigate("/") });
  }

  // Only fires when the click lands on the empty background itself, not on
  // any nav link, button, or menu nested inside it — attached both to the
  // outer rail and to <nav> since <nav>'s own blank space (below the last
  // link) is a distinct element the outer handler's target check won't catch.
  // onPointerDown rather than onClick, matching the same background-click
  // pattern in builder/canvas.tsx — it isn't read by jsx-a11y's click-only
  // interactivity rules, and a plain div toggling on pointerdown needs no
  // keyboard equivalent since it's a background area, not a control.
  function handleBackgroundClick(e: PointerEvent) {
    if (clickToToggle && e.target === e.currentTarget) toggleCollapsed();
  }

  const collapseToggle = (
    <button
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {collapsed ? (
        <ChevronsRight className="size-4" />
      ) : (
        <ChevronsLeft className="size-4" />
      )}
    </button>
  );

  return (
    <div
      className="flex h-full w-full flex-col px-3 py-4"
      onPointerDown={handleBackgroundClick}
    >
      <div
        className={cn(
          "flex items-center gap-2 pb-5",
          collapsed ? "justify-center px-0" : "px-2 justify-between",
        )}
        onPointerDown={handleBackgroundClick}
      >
        {!collapsed && (
          <span className="flex min-w-0 flex-col items-center">
            <BrandMark className="h-7" />
            <ProductLabel className="truncate text-[9.5px] tracking-[0.12em] text-ink-faint" />
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>{collapseToggle}</TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>

      <DropdownMenu>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="New"
                  className="mb-5 flex size-7 shrink-0 items-center justify-center self-center rounded-full bg-primary text-primary-ink transition-colors hover:bg-primary-hover"
                >
                  <Plus className="size-3" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">New</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>
            <button className="mb-5 flex h-7 w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-[11.5px] font-semibold text-primary-ink transition-colors hover:bg-primary-hover">
              <Plus className="size-3" />
              New
            </button>
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Create</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => navigate("/explore")}
            onMouseEnter={() => prefetchRoute("/explore", queryClient)}
          >
            <Sparkles className="size-4 text-ink-soft" />
            Ask a question
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => navigate("/reports?new=1")}
            onMouseEnter={() => prefetchRoute("/reports", queryClient)}
          >
            <FilePlus2 className="size-4 text-ink-soft" />
            New report
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => navigate("/experiments")}
            onMouseEnter={() => prefetchRoute("/experiments", queryClient)}
          >
            <FlaskConical className="size-4 text-ink-soft" />
            New experiment
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => navigate("/connections/new")}
            onMouseEnter={() => prefetchRoute("/connections/new", queryClient)}
          >
            <Plug className="size-4 text-ink-soft" />
            Connect a source
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav
        className="flex flex-1 flex-col gap-0.5"
        onPointerDown={handleBackgroundClick}
      >
        {primaryNav.map((item) => (
          <NavRow key={item.to} {...item} collapsed={collapsed} />
        ))}
        <div className="my-3 h-px bg-border" />
        {secondaryNav.map((item) => (
          <NavRow key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      <div
        className="mt-3 flex flex-col gap-2"
        onPointerDown={handleBackgroundClick}
      >
        <ThemeToggle className="self-center" iconOnly={collapsed} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={collapsed ? (user?.name ?? "Account") : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-(--radius-sm) py-2 text-left transition-colors hover:bg-surface-2",
                collapsed ? "justify-center px-0" : "px-2",
              )}
            >
              {user && (
                <Avatar name={user.name} color={user.avatarColor} size={30} />
              )}
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {user?.name ?? "Unnamed"}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-faint">
                    {workspace?.name ?? "Unnamed workspace"}
                  </span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <div className="scrollbar-thin max-h-48 overflow-y-auto">
              {myWorkspaces.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onSelect={() => handleSwitch(w.id)}
                >
                  <Building2 className="size-3.5 shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  {w.id === workspace?.id ? (
                    <Check className="size-3.5 shrink-0 text-accent-ink" />
                  ) : (
                    <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
                      {roleLabel[w.myRole] ?? w.myRole}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuItem onSelect={() => setCreateWorkspaceOpen(true)}>
              <Plus className="size-3.5 text-ink-soft" />
              Create workspace
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{workspace?.name}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              Workspace settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => navigate("/settings?tab=members")}
            >
              Members & roles
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void dispatch(signOut()).finally(() =>
                  navigate("/login", { replace: true }),
                );
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onCreated={() => navigate("/")}
      />
    </div>
  );
}

/** The always-visible rail at desktop widths (lg and up). Hidden below that — see MobileNavDrawer. */
export function Sidebar() {
  const collapsed = useAppSelector((state) => state.sidebar.collapsed);
  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 border-r border-border bg-surface transition-[width] duration-150 lg:flex",
        collapsed ? "w-16" : "w-52",
      )}
    >
      <SidebarContent collapsed={collapsed} clickToToggle />
    </aside>
  );
}
