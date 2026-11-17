import React, { useEffect, useMemo, useState } from "react";
import {
  listAllUsers,
  updateUserPermissions,
  updateUserDetails,
  createUserRecord,
  softDeleteUser,
} from "@/services/authService";
import { useAuth } from "@/lib/AuthContext";
import {
  MODULES,
  ASSIGNABLE_MODULE_KEYS,
  isAdminUser,
  effectiveModuleKeys,
} from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  ShieldCheck,
  Save,
  UserPlus,
  CheckSquare,
  Square,
  Power,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const ASSIGNABLE_MODULES = MODULES.filter((m) => !m.adminOnly);

export default function UserManagement() {
  const { user: currentUser, checkUserAuth } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [saving, setSaving] = useState(false);

  // Add User modal state
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    id: "",
    name: "",
    email: "",
    password: "",
    role: "staff",
    role_label: "",
    dept: "",
    avatar_initials: "",
  });
  const [creating, setCreating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await listAllUsers();
      setUsers(list);
      if (list.length > 0 && !selectedUserId) {
        const firstStaff = list.find((u) => u.role !== "admin") || list[0];
        setSelectedUserId(firstStaff.id);
        setDraftPermissions(Array.isArray(firstStaff.permissions) ? firstStaff.permissions : []);
      }
    } catch (err) {
      toast.error(err?.message || "Failed to load users from Supabase");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const handleSelectUser = (u) => {
    setSelectedUserId(u.id);
    setDraftPermissions(Array.isArray(u.permissions) ? u.permissions : []);
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.dept || "").toLowerCase().includes(q) ||
        (u.role_label || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const filteredModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return ASSIGNABLE_MODULES;
    return ASSIGNABLE_MODULES.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.key.toLowerCase().includes(q)
    );
  }, [moduleSearch]);

  const toggleModule = (key) => {
    setDraftPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllModules = () => {
    setDraftPermissions([...ASSIGNABLE_MODULE_KEYS]);
  };

  const clearAllModules = () => {
    setDraftPermissions([]);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const updated = await updateUserPermissions(selectedUser.id, draftPermissions);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      if (updated.id === currentUser?.id) {
        await checkUserAuth();
      }
      toast.success(`Saved module access for ${updated.name} in Supabase.`);
    } catch (err) {
      toast.error(err?.message || "Failed to save permissions.");
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (u, nextRole) => {
    try {
      const updated = await updateUserDetails(u.id, { role: nextRole });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`${updated.name} role updated to ${nextRole}.`);
    } catch (err) {
      toast.error(err?.message || "Failed to update role.");
    }
  };

  const handleToggleStatus = async (u) => {
    const nextStatus = u.status === "suspended" ? "active" : "suspended";
    try {
      const updated = await updateUserDetails(u.id, { status: nextStatus });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`${updated.name} is now ${nextStatus}.`);
    } catch (err) {
      toast.error(err?.message || "Failed to update status.");
    }
  };

  const handleDeleteUser = async (u) => {
    if (u.id === currentUser?.id) {
      return toast.error("You cannot delete your own active admin account.");
    }
    if (!window.confirm(`Remove user "${u.name}" (${u.email})?`)) return;
    try {
      await softDeleteUser(u.id);
      const remaining = users.filter((x) => x.id !== u.id);
      setUsers(remaining);
      if (selectedUserId === u.id) {
        const next = remaining[0] || null;
        setSelectedUserId(next?.id || null);
        setDraftPermissions(next?.permissions || []);
      }
      toast.success(`Removed ${u.name}.`);
    } catch (err) {
      toast.error(err?.message || "Failed to remove user.");
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      return toast.error("Name, email, and password are required.");
    }
    setCreating(true);
    try {
      const created = await createUserRecord({
        ...newUser,
        permissions: newUser.role === "admin" ? ["*"] : ["attention_dashboard"],
      });
      setUsers((prev) => [...prev, created]);
      setSelectedUserId(created.id);
      setDraftPermissions(created.permissions || []);
      setNewUser({
        id: "",
        name: "",
        email: "",
        password: "",
        role: "staff",
        role_label: "",
        dept: "",
        avatar_initials: "",
      });
      setAddOpen(false);
      toast.success(`User "${created.name}" created in Supabase.`);
    } catch (err) {
      toast.error(err?.message || "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  if (!isAdminUser(currentUser)) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin Access Required</CardTitle>
            <CardDescription>
              Only administrators can view and manage user module access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            User &amp; Module Access Management
          </h1>
          <p className="text-sm text-slate-500">
            Select a registered user to grant or revoke module access. Changes save directly to Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1" />
            Add User
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Registered Users List */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Registered Users ({users.length})</CardTitle>
            <div className="relative mt-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, dept..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
            {loading ? (
              <p className="text-sm text-slate-400 py-6 text-center">Loading users...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No matching users found.</p>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = u.id === selectedUserId;
                const modCount = isAdminUser(u)
                  ? MODULES.length
                  : effectiveModuleKeys(u).length;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50/70"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-800 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                      {u.avatar_initials || "U"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-slate-900 truncate">
                          {u.name}
                        </span>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[10px]">
                          {u.role}
                        </Badge>
                        {u.status === "suspended" && (
                          <Badge variant="destructive" className="text-[10px]">
                            suspended
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {[u.role_label, u.dept].filter(Boolean).join(" · ") || "No dept"} ·{" "}
                        {modCount} modules
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right: Module Access Editor */}
        <Card className="lg:col-span-7">
          {!selectedUser ? (
            <CardContent className="py-16 text-center text-sm text-slate-400">
              Select a user from the list to manage their module access.
            </CardContent>
          ) : (
            <>
              <CardHeader className="border-b pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm flex items-center justify-center shrink-0">
                      {selectedUser.avatar_initials || "U"}
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {selectedUser.name}
                        <span className="text-xs font-normal text-slate-400">({selectedUser.id})</span>
                      </CardTitle>
                      <CardDescription>
                        {selectedUser.email} · {selectedUser.role_label || selectedUser.role}
                        {selectedUser.dept ? ` · ${selectedUser.dept}` : ""}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={selectedUser.role}
                      onValueChange={(val) => handleRoleChange(selectedUser, val)}
                      disabled={selectedUser.id === currentUser?.id}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">staff</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus(selectedUser)}
                      disabled={selectedUser.id === currentUser?.id}
                      title={selectedUser.status === "suspended" ? "Activate user" : "Suspend user"}
                    >
                      <Power className="w-3.5 h-3.5 mr-1" />
                      {selectedUser.status === "suspended" ? "Activate" : "Suspend"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => handleDeleteUser(selectedUser)}
                      disabled={selectedUser.id === currentUser?.id}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-4">
                {isAdminUser(selectedUser) ? (
                  <div className="p-4 rounded-lg bg-indigo-50 border border-indigo-200 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-indigo-900">
                      <p className="font-medium">Administrator Account</p>
                      <p className="text-xs text-indigo-700 mt-0.5">
                        Admins automatically have access to all modules including User Management. Change role to <strong>staff</strong> above if you want to restrict them to specific modules.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          value={moduleSearch}
                          onChange={(e) => setModuleSearch(e.target.value)}
                          placeholder="Filter modules..."
                          className="pl-9 h-9"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={selectAllModules}>
                          <CheckSquare className="w-3.5 h-3.5 mr-1" /> Select All
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={clearAllModules}>
                          <Square className="w-3.5 h-3.5 mr-1" /> Clear All
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
                      {filteredModules.map((mod) => {
                        const checked = draftPermissions.includes(mod.key);
                        return (
                          <label
                            key={mod.key}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              checked
                                ? "border-indigo-400 bg-indigo-50/50"
                                : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleModule(mod.key)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-800">{mod.label}</p>
                              <p className="text-[11px] text-slate-500 line-clamp-2">
                                {mod.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-slate-500">
                        {draftPermissions.length} module(s) selected (+ Attention Dashboard home)
                      </span>
                      <Button onClick={handleSavePermissions} disabled={saving}>
                        <Save className="w-4 h-4 mr-1.5" />
                        {saving ? "Saving..." : "Save Module Access"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Registered User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">User ID (optional)</Label>
                <Input
                  value={newUser.id}
                  onChange={(e) => setNewUser({ ...newUser, id: e.target.value })}
                  placeholder="e.g. usr-staff-02"
                />
              </div>
              <div>
                <Label className="text-xs">Avatar Initials</Label>
                <Input
                  value={newUser.avatar_initials}
                  onChange={(e) => setNewUser({ ...newUser, avatar_initials: e.target.value })}
                  placeholder="e.g. JD"
                  maxLength={4}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Full Name *</Label>
              <Input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="John Doe"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="john@wmg.local"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Password *</Label>
              <Input
                type="text"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Enter password"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(val) => setNewUser({ ...newUser, role: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">staff</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Role Label</Label>
                <Input
                  value={newUser.role_label}
                  onChange={(e) => setNewUser({ ...newUser, role_label: e.target.value })}
                  placeholder="QA Officer"
                />
              </div>
              <div>
                <Label className="text-xs">Dept</Label>
                <Input
                  value={newUser.dept}
                  onChange={(e) => setNewUser({ ...newUser, dept: e.target.value })}
                  placeholder="QA/QC"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
