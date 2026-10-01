import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, UserPlus } from "lucide-react";
import {
  useAddTeamMember,
  useChangePassword,
  useCurrentUser,
  useCurrentWorkspace,
  useDataSources,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateMemberRole,
  useUpdateProfile,
  useUpdateWorkspace,
} from "@/api/hooks";
import { isMockMode } from "@/api/client";
import { resetMockData } from "@/api/mock/adapter";
import type { Role, User, Workspace } from "@apicem/api-contract";

const roleLabels: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function GeneralTab() {
  const { data: workspace } = useCurrentWorkspace();
  const { data: user } = useCurrentUser();
  if (!workspace) return null;
  return (
    <GeneralSettingsForm
      key={`${workspace.id}:${workspace.name}`}
      workspace={workspace}
      canManage={user?.role === "owner" || user?.role === "admin"}
    />
  );
}

function GeneralSettingsForm({
  workspace,
  canManage,
}: {
  workspace: Workspace;
  canManage: boolean;
}) {
  const updateWorkspace = useUpdateWorkspace();
  const [name, setName] = useState(workspace.name);
  const [status, setStatus] = useState("");
  return (
    <Card className="max-w-xl p-6">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canManage) return;
          setStatus("");
          try {
            await updateWorkspace.mutateAsync(name);
            setStatus("Workspace name saved.");
          } catch {
            setStatus("Could not save the workspace name.");
          }
        }}
      >
        <div>
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            disabled={!canManage}
          />
        </div>
        <div>
          <Label htmlFor="ws-slug">Workspace URL</Label>
          <Input
            id="ws-slug"
            defaultValue={`app.apicemengine.com/${workspace.slug}`}
            disabled
          />
          <p className="mt-1 text-[12px] text-ink-faint">
            This stable workspace URL does not change when you rename the workspace.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-(--radius-md) bg-surface-2 px-4 py-3">
          <div>
            <p className="text-[13px] font-medium text-ink">Current plan</p>
            <p className="text-[12px] text-ink-faint">
              {workspace.memberCount} members
            </p>
          </div>
          <Badge tone="accent" className="capitalize">
            {workspace.plan}
          </Badge>
        </div>
        {canManage ? (
          <div className="flex items-center justify-between gap-3">
            {status && (
              <output className="text-[12.5px] text-ink-soft">{status}</output>
            )}
            <Button type="submit" size="sm" loading={updateWorkspace.isPending}>
              Save changes
            </Button>
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-faint">
            Only workspace owners and admins can change workspace details.
          </p>
        )}
      </form>
    </Card>
  );
}

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "success" | "mismatch" | "error"
  >("idle");

  return (
    <Card className="p-6">
      <p className="text-[13.5px] font-medium text-ink">Change password</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (newPassword !== confirmPassword) {
            setStatus("mismatch");
            return;
          }
          try {
            await changePassword.mutateAsync({ currentPassword, newPassword });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setStatus("success");
          } catch {
            setStatus("error");
          }
        }}
      >
        <div>
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
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
        <Button type="submit" size="sm" loading={changePassword.isPending}>
          Update password
        </Button>
        {status === "success" && (
          <p className="text-[12.5px] text-success">Password updated.</p>
        )}
        {status === "mismatch" && (
          <p className="text-[12.5px] text-danger">
            New passwords don't match.
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="text-[12.5px] text-danger">
            Could not update password. Check your current password.
          </p>
        )}
      </form>
    </Card>
  );
}

function AccountTab() {
  const { data: user } = useCurrentUser();
  if (!user) return null;
  return (
    <div className="max-w-xl space-y-6">
      <AccountProfileForm key={`${user.id}:${user.name}`} user={user} />
      <ChangePasswordCard />
    </div>
  );
}

function AccountProfileForm({ user }: { user: User }) {
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState("");
  return (
    <Card className="p-6">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("");
          try {
            await updateProfile.mutateAsync(name);
            setStatus("Profile saved.");
          } catch {
            setStatus("Could not save your profile.");
          }
        }}
      >
        <div>
          <Label htmlFor="acct-name">Name</Label>
          <Input
            id="acct-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
          />
        </div>
        <div>
          <Label htmlFor="acct-email">Email</Label>
          <Input
            id="acct-email"
            type="email"
            defaultValue={user.email}
            disabled
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          {status && (
            <output className="text-[12.5px] text-ink-soft">{status}</output>
          )}
          <Button type="submit" size="sm" loading={updateProfile.isPending}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AddTeammateDialog({ currentUserRole }: { currentUserRole?: Role }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [errorMsg, setErrorMsg] = useState("");
  const addMember = useAddTeamMember();

  const allowedRoles = (Object.keys(roleLabels) as Role[]).filter(
    (r) => r !== "owner" && (currentUserRole === "owner" || r !== "admin"),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!email.trim() || !password) {
      setErrorMsg("Email and password are required.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }
    try {
      await addMember.mutateAsync({ email: email.trim(), password, role });
      setEmail("");
      setPassword("");
      setRole("viewer");
      setOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add teammate.";
      setErrorMsg(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setErrorMsg(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="size-4" />
          Add teammate
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add teammate</DialogTitle>
          <DialogDescription>
            Invite a new member to this workspace with a specified role and password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-password">Initial Password</Label>
            <Input
              id="member-password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {errorMsg && (
            <p role="alert" className="text-[12.5px] text-danger">
              {errorMsg}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={addMember.isPending}>
              Create teammate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MembersTab() {
  const { data: members = [] } = useTeamMembers();
  const { data: user } = useCurrentUser();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveTeamMember();
  const canManageRoles = user?.role === "owner" || user?.role === "admin";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Team Members</h3>
          <p className="text-[12px] text-ink-faint">
            Manage who has access to this workspace and their role permissions.
          </p>
        </div>
        {canManageRoles && <AddTeammateDialog currentUserRole={user?.role} />}
      </div>
      <Card>
        <div className="divide-y divide-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
              <Avatar name={m.name} color={m.avatarColor} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {m.name}
                  </p>
                  {m.id === user?.id && (
                    <Badge tone="neutral" className="text-[10.5px]">You</Badge>
                  )}
                </div>
                <p className="truncate text-[12px] text-ink-faint">{m.email}</p>
              </div>
              {m.role === "owner" ? (
                <span className="w-28 text-right text-[13px] font-medium text-ink-faint">
                  Owner
                </span>
              ) : (
                <Select
                  value={m.role}
                  onValueChange={(value) =>
                    updateRole.mutate({ userId: m.id, role: value as Role })
                  }
                  disabled={!canManageRoles || m.id === user?.id}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(roleLabels) as Role[])
                      .filter(
                        (role) =>
                          role !== "owner" &&
                          (user?.role === "owner" || role !== "admin"),
                      )
                      .map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabels[r]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {canManageRoles && m.id !== user?.id && m.role !== "owner" && (
                <button
                  type="button"
                  title="Remove teammate"
                  onClick={() => {
                    if (confirm(`Remove ${m.name || m.email} from this workspace?`)) {
                      removeMember.mutate(m.id);
                    }
                  }}
                  disabled={removeMember.isPending}
                  className="rounded p-1.5 text-ink-faint transition hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {updateRole.isError && (
          <p role="alert" className="px-5 py-3 text-[12.5px] text-danger">
            Could not update that role.
          </p>
        )}
        {removeMember.isError && (
          <p role="alert" className="px-5 py-3 text-[12.5px] text-danger">
            Could not remove that teammate.
          </p>
        )}
      </Card>
    </div>
  );
}

function UsageTab() {
  const { data: sources = [] } = useDataSources();
  const { data: workspace } = useCurrentWorkspace();

  const rows = [
    { label: "Connected sources", value: sources.length },
    { label: "Workspace members", value: workspace?.memberCount ?? 0 },
  ];

  return (
    <div className="max-w-xl space-y-4">
      {rows.map((row) => (
        <Card key={row.label} className="p-5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium text-ink">{row.label}</span>
            <span className="tabular text-ink-faint">{row.value.toLocaleString()}</span>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            Current workspace count. Plan limits are not configured yet.
          </p>
        </Card>
      ))}
      <Card className="max-w-xl p-5">
        <p className="text-[13px] font-medium text-ink">Monthly queries</p>
        <p className="mt-1 text-[12.5px] text-ink-faint">
          Query usage isn’t available from this backend yet.
        </p>
      </Card>
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
        Wipes every workspace back to its original seeded state, including any
        workspace you've created or edited this session. Use this between
        conversations at a booth or walkthrough so the next person sees a clean
        demo, not whatever the last one left behind.
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
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage access, usage, and workspace details."
      />
      <Tabs defaultValue={initialTab}>
        <div className="scrollbar-thin mb-6 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            {canResetDemoData && (
              <TabsTrigger value="demo-data">Demo data</TabsTrigger>
            )}
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
