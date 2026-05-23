"use client";

import { useState } from "react";
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

export function AdminUsersClient({
  currentUserId,
  initialUsers,
  initialError = null,
}: {
  currentUserId: string;
  initialUsers: AdminUser[];
  initialError?: string | null;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [addOpen, setAddOpen] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403) {
        setLoadError("You do not have admin access.");
        toast.error("You do not have admin access");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          (data as { error?: string }).error ?? "Failed to load team members";
        setLoadError(msg);
        toast.error(msg);
        return;
      }
      setUsers(await res.json());
    } catch {
      const msg = "Could not load team members. Refresh the page.";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to create user");
      return;
    }
    toast.success(`Created ${email}`);
    setEmail("");
    setPassword("");
    setAddOpen(false);
    load();
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    const res = await fetch(`/api/admin/users/${resetUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to reset password");
      return;
    }
    toast.success(`Password updated for ${resetUser.email}`);
    setNewPassword("");
    setResetUser(null);
  }

  async function handleDelete(u: AdminUser) {
    if (!confirm(`Remove access for ${u.email}? This cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to delete user");
      return;
    }
    toast.success(`Removed ${u.email}`);
    load();
  }

  if (loading) {
    return <p className="text-slate">Loading team members…</p>;
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-body-sm text-danger">
          {loadError}
        </p>
      )}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-body-sm text-slate max-w-xl">
            Create accounts for your team. They sign in at the same login page
            and use the audiobook production tools — not this admin area.
          </p>
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
                  <p className="text-xs text-slate mt-1">Minimum 8 characters</p>
                </div>
                <Button type="submit">Create account</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Last sign-in</TableHead>
            <TableHead>Created</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                {u.email}
                {u.id === currentUserId && (
                  <span className="ml-2 text-xs text-slate">(you)</span>
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
              <TableCell className="space-x-2">
                <Button
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
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => handleDelete(u)}
                  >
                    Remove
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={!!resetUser}
        onOpenChange={(o) => !o && setResetUser(null)}
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
                />
              </div>
              <Button type="submit">Update password</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
