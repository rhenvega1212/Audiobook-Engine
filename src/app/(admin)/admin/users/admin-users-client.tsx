"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

const REFRESH_DELAY_MS = 2000;

function dedupeUsers(list: AdminUser[]): AdminUser[] {
  const map = new Map<string, AdminUser>();
  for (const u of list) {
    const key = u.id || u.email;
    if (!key) continue;
    map.set(key, u);
  }
  return Array.from(map.values());
}

export function AdminUsersClient({
  currentUserId,
  initialUsers,
  initialError = null,
  teamManagerIds: initialManagerIds,
  canManageTeam,
  canGrantPermissions,
  superAdminEmails,
}: {
  currentUserId: string;
  initialUsers: AdminUser[];
  initialError?: string | null;
  teamManagerIds: string[];
  canManageTeam: boolean;
  canGrantPermissions: boolean;
  superAdminEmails: string[];
}) {
  const [users, setUsers] = useState(() => dedupeUsers(initialUsers));
  const [managerIds, setManagerIds] = useState(
    () => new Set(initialManagerIds)
  );
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const router = useRouter();

  const displayUsers = useMemo(() => dedupeUsers(users), [users]);

  useEffect(() => {
    setUsers(dedupeUsers(initialUsers));
    setLoadError(initialError ?? null);
    setManagerIds(new Set(initialManagerIds));
  }, [initialUsers, initialError, initialManagerIds]);

  function apiErrorMessage(data: unknown, fallback: string): string {
    if (data && typeof data === "object" && "error" in data) {
      const err = (data as { error: unknown }).error;
      if (typeof err === "string") return err;
    }
    return fallback;
  }

  function scheduleRefresh(message: string) {
    setStatusMessage(`${message} Refreshing in 2 seconds…`);
    toast.success(message);
    setTimeout(() => {
      router.refresh();
      setStatusMessage(null);
    }, REFRESH_DELAY_MS);
  }

  function isSuperAdminUser(u: AdminUser) {
    return superAdminEmails.includes(u.email.trim().toLowerCase());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(data, "Failed to create user"));
        return;
      }
      const created = data as {
        id: string;
        email: string;
        created_at: string;
      };
      setUsers((prev) =>
        dedupeUsers([
          ...prev,
          {
            id: created.id,
            email: created.email,
            created_at: created.created_at,
            last_sign_in_at: null,
            email_confirmed_at: new Date().toISOString(),
          },
        ])
      );
      setEmail("");
      setPassword("");
      setAddOpen(false);
      scheduleRefresh(`Created ${created.email}.`);
    } catch {
      toast.error("Could not create user. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${resetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(data, "Failed to reset password"));
        return;
      }
      const emailLabel = resetUser.email;
      setNewPassword("");
      setResetUser(null);
      scheduleRefresh(`Password updated for ${emailLabel}.`);
    } catch {
      toast.error("Could not reset password. Try again.");
    } finally {
      setResetting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(data, "Failed to remove user"));
        return;
      }
      const emailLabel = deleteUser.email;
      setUsers((prev) => prev.filter((x) => x.id !== deleteUser.id));
      setManagerIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteUser.id);
        return next;
      });
      setDeleteUser(null);
      scheduleRefresh(`Removed ${emailLabel}.`);
    } catch {
      toast.error("Could not remove user. Try again.");
    } finally {
      setRemoving(false);
    }
  }

  async function toggleTeamManager(user: AdminUser, enabled: boolean) {
    setTogglingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/team-manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(data, "Failed to update permission"));
        return;
      }
      setManagerIds((prev) => {
        const next = new Set(prev);
        if (enabled) next.add(user.id);
        else next.delete(user.id);
        return next;
      });
      scheduleRefresh(
        enabled
          ? `${user.email} can now add and remove team members.`
          : `Removed team management permission for ${user.email}.`
      );
    } catch {
      toast.error("Could not update permission. Try again.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-body-sm text-danger">
          {loadError}
        </p>
      )}
      {statusMessage && (
        <p className="rounded-md border border-teal/30 bg-teal/5 px-4 py-3 text-body-sm text-teal">
          {statusMessage}
        </p>
      )}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-body-sm text-slate max-w-xl">
            {canManageTeam
              ? "Create accounts for your team. They sign in at the same login page and use Production app for books and voices."
              : "You can view the team list. Ask a super admin to grant you permission to add or remove members."}
          </p>
          {canManageTeam && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>+ Add team member</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New team member</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="new-email">Email</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-password">Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <p className="text-xs text-slate mt-1">
                      Minimum 8 characters
                    </p>
                  </div>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating…" : "Create account"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border border-border bg-bone">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead>Created</TableHead>
              {canGrantPermissions && (
                <TableHead>Can add/remove</TableHead>
              )}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayUsers.map((u) => {
              const rowKey = u.id || `email-${u.email}`;
              const showPermToggle =
                canGrantPermissions &&
                u.id !== currentUserId &&
                !isSuperAdminUser(u);

              return (
                <TableRow key={rowKey}>
                  <TableCell>
                    {u.email}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-xs text-slate">(you)</span>
                    )}
                    {isSuperAdminUser(u) && (
                      <span className="ml-2 text-xs text-slate">(admin)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate text-body-sm">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-slate text-body-sm">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  {canGrantPermissions && (
                    <TableCell>
                      {showPermToggle ? (
                        <label className="inline-flex items-center gap-2 text-body-sm cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border"
                            checked={managerIds.has(u.id)}
                            disabled={togglingId === u.id}
                            onChange={(e) =>
                              toggleTeamManager(u, e.target.checked)
                            }
                          />
                          <span className="text-slate">
                            {togglingId === u.id ? "Saving…" : "Allowed"}
                          </span>
                        </label>
                      ) : (
                        <span className="text-body-sm text-slate">
                          {isSuperAdminUser(u) || u.id === currentUserId
                            ? "Always"
                            : "—"}
                        </span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right space-x-2">
                    {canManageTeam && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setResetUser(u);
                            setNewPassword("");
                          }}
                        >
                          Reset password
                        </Button>
                        {u.id !== currentUserId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteUser(u)}
                          >
                            Remove
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!resetUser}
        onOpenChange={(o) => !o && !resetting && setResetUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          {resetUser && (
            <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
              <p className="text-body-sm text-slate">{resetUser.email}</p>
              <div>
                <Label htmlFor="reset-pw">New password</Label>
                <Input
                  id="reset-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  disabled={resetting}
                />
              </div>
              <Button
                type="submit"
                disabled={resetting || newPassword.length < 8}
              >
                {resetting ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteUser}
        onOpenChange={(o) => !o && !removing && setDeleteUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member</DialogTitle>
          </DialogHeader>
          {deleteUser && (
            <div className="space-y-4 pt-2">
              <p className="text-body-sm text-slate">
                Remove access for <strong>{deleteUser.email}</strong>? They will
                no longer be able to sign in. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={removing}
                  onClick={confirmDelete}
                >
                  {removing ? "Removing…" : "Yes, remove"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={removing}
                  onClick={() => setDeleteUser(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
