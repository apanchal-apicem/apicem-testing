import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser, useCurrentWorkspace, useDataSources, useTeamMembers } from "@/api/hooks";
import { isMockMode } from "@/api/client";
import { resetMockData } from "@/api/mock/adapter";
import type { Role } from "@apicem/api-contract";

const roleLabels: Record<Role, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

function GeneralTab() {
  const { data: workspace } = useCurrentWorkspace();
  if (!workspace) return null;
  return (
    <Card className="max-w-xl p-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input id="ws-name" defaultValue={workspace.name} />
        </div>
        <div>
          <Label htmlFor="ws-slug">Workspace URL</Label>
          <Input id="ws-slug" defaultValue={`app.apicemengine.com/${workspace.slug}`} disabled />
        </div>
        <div className="flex items-center justify-between rounded-(--radius-md) bg-surface-2 px-4 py-3">
          <div>
            <p className="text-[13px] font-medium text-ink">Current plan</p>
            <p className="text-[12px] text-ink-faint">{workspace.memberCount} members</p>
          </div>
          <Badge tone="accent" className="capitalize">
            {workspace.plan}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

function ChangePasswordCard() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "mismatch">("idle");

  return (
    <Card className="p-6">
      <p className="text-[13.5px] font-medium text-ink">Change password</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setStatus(newPassword === confirmPassword ? "success" : "mismatch");
        }}
      >
        <div>
          <Label htmlFor="current-password">Current password</Label>
          <Input id="current-password" type="password" required />
        </div>
        <div>
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setStatus("idle");
            }}
          />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setStatus("idle");
            }}
          />
        </div>
        <Button type="submit" size="sm">
          Update password
        </Button>
        {status === "success" && <p className="text-[12.5px] text-success">Password updated.</p>}
        {status === "mismatch" && <p className="text-[12.5px] text-danger">New passwords don't match.</p>}
      </form>
    </Card>
  );
}

function AccountTab() {
  const { data: user } = useCurrentUser();
  if (!user) return null;
  return (
    <div className="max-w-xl space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="acct-name">Name</Label>
            <Input id="acct-name" defaultValue={user.name} />
          </div>
          <div>
            <Label htmlFor="acct-email">Email</Label>
            <Input id="acct-email" type="email" defaultValue={user.email} disabled />
          </div>
        </div>
      </Card>
      <ChangePasswordCard />
    </div>
  );
}

function MembersTab() {
  const { data: members = [] } = useTeamMembers();
  const [roles, setRoles] = useState<Record<string, Role>>({});

  return (
    <Card>
      <div className="divide-y divide-border">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
            <Avatar name={m.name} color={m.avatarColor} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-ink">{m.name}</p>
              <p className="truncate text-[12px] text-ink-faint">{m.email}</p>
            </div>
            {m.role === "owner" ? (
              <span className="w-32 text-right text-[13px] font-medium text-ink-faint">Owner</span>
            ) : (
              <Select
                value={roles[m.id] ?? m.role}
                onValueChange={(v) => setRoles((r) => ({ ...r, [m.id]: v as Role }))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(roleLabels) as Role[])
                    .filter((r) => r !== "owner")
                    .map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabels[r]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function UsageTab() {
  const { data: sources = [] } = useDataSources();
  const { data: workspace } = useCurrentWorkspace();

  const rows = [
    { label: "Connected sources", value: sources.length, limit: 10 },
    { label: "Workspace members", value: workspace?.memberCount ?? 0, limit: 15 },
    { label: "Monthly queries", value: 8_420, limit: 25_000 },
  ];

  return (
    <div className="max-w-xl space-y-4">
      {rows.map((row) => (
        <Card key={row.label} className="p-5">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="font-medium text-ink">{row.label}</span>
            <span className="tabular text-ink-faint">
              {row.value.toLocaleString()} / {row.limit.toLocaleString()}
            </span>
          </div>
          <Progress value={Math.min(100, (row.value / row.limit) * 100)} />
        </Card>
      ))}
    </div>
  );
}

/**
 * Mock-only: lets whoever's driving a demo (a booth, a walkthrough) wipe
 * accumulated edits back to the pristine seeded state between conversations,
 * rather than the next person inheriting whatever the last one left behind.
 * Two-step confirm (no AlertDialog primitive exists in this codebase yet,
 * and one more destructive-but-recoverable-by-reseeding action doesn't
 * justify introducing one) rather than firing on the first click, since this
 * is considerably more destructive than any other single action in the app.
 * Gated to the owner role at the one call site below — this is UI-only,
 * not a real access-control boundary (the mock enforces nothing server-side,
 * same caveat as everywhere else in Settings → Members), but a workspace
 * that models per-membership roles at all shouldn't hand its most
 * destructive control to every role uniformly.
 */
function DemoDataTab() {
  const [confirming, setConfirming] = useState(false);
  return (
    <Card className="max-w-xl p-6">
      <p className="text-[13.5px] font-medium text-ink">Reset demo data</p>
      <p className="mt-1.5 text-[12.5px] text-ink-soft">
        Wipes every workspace back to its original seeded state, including any workspace you've created or edited
        this session. Use this between conversations at a booth or walkthrough so the next person sees a clean demo,
        not whatever the last one left behind.
      </p>
      <Button
        variant={confirming ? "destructive" : "outline"}
        size="sm"
        className="mt-4"
        onClick={() => (confirming ? resetMockData() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? "Click again to confirm" : "Reset demo data"}
      </Button>
    </Card>
  );
}

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "general";
  const { data: user } = useCurrentUser();
  const canResetDemoData = isMockMode && user?.role === "owner";

  return (
    <div>
      <PageHeader eyebrow="Workspace" title="Settings" description="Manage access, usage, and workspace details." />
      <Tabs defaultValue={initialTab}>
        <div className="scrollbar-thin mb-6 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            {canResetDemoData && <TabsTrigger value="demo-data">Demo data</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab />
        </TabsContent>
        <TabsContent value="usage">
          <UsageTab />
        </TabsContent>
        {canResetDemoData && (
          <TabsContent value="demo-data">
            <DemoDataTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
