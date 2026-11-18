import React, { useEffect, useMemo, useState } from "react";
import {
  listAllUsers,
  updateUserPermissions,
  updateUserDetails,
  createUserRecord,
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
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const ASSIGNABLE_MODULES = MODULES.filter((m) => !m.adminOnly);

const initialDraftForUser = (u) => {
  if (!u) return [];
  if (Array.isArray(u.permissions) && u.permissions.length > 0) {
    return u.permissions;
  }
  return effectiveModuleKeys(u);
};

export default function UserManagement() {
  const { user: currentUser, checkUserAuth } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success" | "error", message: string }

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

  const loadUsers = async (showToast = false) => {
    setLoading(true);
    try {
      const list = await listAllUsers();
      setUsers(list);
      if (list.length > 0) {
        const currentSelected = list.find((u) => u.id === selectedUserId);
        const target = currentSelected || list.find((u) => u.role !== "admin") || list[0];
        setSelectedUserId(target.id);
        setDraftPermissions(initialDraftForUser(target));
      }
      if (showToast) {
        toast.success(`Loaded ${list.length} user(s) from Supabase.`);
      }
    } catch (err) {
      const msg = err?.message || "Failed to load users from Supabase.";
      toast.error(msg);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const handleSelectUser = (u) => {
    setSelectedUserId(u.id);
    setDraftPermissions(initialDraftForUser(u));
    setFeedback(null);
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
    setFeedback(null);
    setDraftPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllModules = () => {
    setFeedback(null);
    setDraftPermissions([...ASSIGNABLE_MODULE_KEYS]);
  };

  const clearAllModules = () => {
    setFeedback(null);
    setDraftPermissions([]);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setFeedback(null);
    try {
      // Always include attention_dashboard so explicit permissions remain non-empty and take precedence
      const permissionsToSave = [...new Set(["attention_dashboard", ...draftPermissions])];
      const updated = await updateUserPermissions(selectedUser.id, permissionsToSave);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setDraftPermissions(initialDraftForUser(updated));
      if (updated.id === currentUser?.id) {
        await checkUserAuth();
      }
      const msg = `Saved module access for ${updated.name}.`;
      setFeedback({ type: "success", message: msg });
      toast.success(msg);
    } catch (err) {
      const msg = err?.message || "Failed to save permissions.";
      setFeedback({ type: "error", message: msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (u, nextRole) => {
    setFeedback(null);
    try {
      const updated = await updateUserDetails(u.id, { role: nextRole });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      if (updated.id === currentUser?.id) {
        await checkUserAuth();
      }
      const msg = `${updated.name} role updated to ${nextRole}.`;
      setFeedback({ type: "success", message: msg });
      toast.success(msg);
    } catch (err) {
      const msg = err?.message || "Failed to update role.";
      setFeedback({ type: "error", message: msg });
      toast.error(msg);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      return toast.error("Name, email, and password are required.");
    }
    setCreating(true);
    setFeedback(null);
    try {
      const created = await createUserRecord({
        ...newUser,
        permissions: newUser.role === "admin" ? ["*"] : ["attention_dashboard"],
      });
      setUsers((prev) => [...prev, created]);
      setSelectedUserId(created.id);
      setDraftPermissions(initialDraftForUser(created));
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
      const msg = `User "${created.name}" created in Supabase.`;
      setFeedback({ type: "success", message: msg });
      toast.success(msg);
    } catch (err) {
      const msg = err?.message || "Failed to create user.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  if (!isAdminUser(currentUser)) {
    return (
      <div className="min-h-screen bg-[#0a0e17] p-6 flex items-start justify-center">
        <Card className="max-w-xl w-full bg-[#131926] border-[#1e2740]">
          <CardHeader>
            <CardTitle className="text-base text-white">Admin Access Required</CardTitle>
            <CardDescription className="text-[#94a3b8]">
              Only administrators can view and manage user module access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 tracking-tight">
              <Users className="w-6 h-6 text-[#00e5ff] shrink-0" />
              User &amp; Module Access
            </h1>
            <p className="text-sm text-[#94a3b8] mt-1">
              Select a registered user to configure their role and module permissions. Changes save directly to Supabase.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadUsers(true)}
              disabled={loading}
              className="bg-[#131926] border-[#1e2740] text-[#e2e8f0] hover:bg-[#1a2234] hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="bg-[#00e5ff] hover:bg-[#00c3d7] text-[#0a0e17] font-semibold"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Add User
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Registered Users List */}
          <Card className="lg:col-span-5 bg-[#131926] border-[#1e2740]">
            <CardHeader className="pb-3 border-b border-[#1e2740]">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-white">
                  Registered Users
                </CardTitle>
                <Badge className="bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30 hover:bg-[#00e5ff]/15">
                  {users.length}
                </Badge>
              </div>
              <div className="relative mt-2.5">
                <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, dept..."
                  className="pl-9 bg-[#0e131d] border-[#1e2740] text-white placeholder:text-[#64748b] focus-visible:ring-[#00e5ff]"
                />
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2 max-h-[620px] overflow-y-auto">
              {loading ? (
                <p className="text-sm text-[#94a3b8] py-8 text-center">Loading users...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-sm text-[#94a3b8] py-8 text-center">No matching users found.</p>
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
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                        isSelected
                          ? "border-[#00e5ff] bg-[#00e5ff]/10 shadow-sm"
                          : "border-[#1e2740] bg-[#0e131d]/60 hover:bg-white/5"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ring-1 ${
                          isSelected
                            ? "bg-[#00e5ff] text-[#0a0e17] ring-[#00e5ff]"
                            : "bg-[#00e5ff]/15 text-[#00e5ff] ring-[#00e5ff]/30"
                        }`}
                      >
                        {u.avatar_initials || "U"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-white truncate">
                            {u.name}
                          </span>
                          <Badge
                            className={`text-[10px] capitalize ${
                              u.role === "admin"
                                ? "bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30"
                                : "bg-[#1e2740] text-[#cbd5e1] border border-[#2d3a5c]"
                            }`}
                          >
                            {u.role}
                          </Badge>
                        </div>
                        <p className="text-xs text-[#94a3b8] truncate mt-0.5">{u.email}</p>
                        <p className="text-[11px] text-[#64748b] truncate mt-0.5">
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
          <Card className="lg:col-span-7 bg-[#131926] border-[#1e2740]">
            {!selectedUser ? (
              <CardContent className="py-20 text-center text-sm text-[#94a3b8]">
                Select a user from the list to manage their module access.
              </CardContent>
            ) : (
              <>
                <CardHeader className="border-b border-[#1e2740] pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-[#00e5ff]/15 text-[#00e5ff] ring-1 ring-[#00e5ff]/30 font-bold text-sm flex items-center justify-center shrink-0">
                        {selectedUser.avatar_initials || "U"}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold text-white flex items-center gap-2 flex-wrap">
                          <span className="truncate">{selectedUser.name}</span>
                          <span className="text-xs font-normal text-[#64748b]">
                            ({selectedUser.id})
                          </span>
                        </CardTitle>
                        <CardDescription className="text-xs text-[#94a3b8] mt-0.5 truncate">
                          {selectedUser.email} · {selectedUser.role_label || selectedUser.role}
                          {selectedUser.dept ? ` · ${selectedUser.dept}` : ""}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[#94a3b8]">Role:</span>
                      <Select
                        value={selectedUser.role}
                        onValueChange={(val) => handleRoleChange(selectedUser, val)}
                        disabled={selectedUser.id === currentUser?.id}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs bg-[#0e131d] border-[#1e2740] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#131926] border-[#1e2740] text-white">
                          <SelectItem value="staff">staff</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {feedback && (
                    <div
                      className={`p-3 rounded-lg border flex items-center gap-2.5 text-sm ${
                        feedback.type === "success"
                          ? "bg-[#00ff9d]/10 border-[#00ff9d]/30 text-[#00ff9d]"
                          : "bg-[#ff4d4d]/10 border-[#ff4d4d]/30 text-[#ff6b6b]"
                      }`}
                    >
                      {feedback.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{feedback.message}</span>
                    </div>
                  )}

                  {isAdminUser(selectedUser) ? (
                    <div className="p-4 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-[#00e5ff] shrink-0 mt-0.5" />
                      <div className="text-sm text-[#e2e8f0]">
                        <p className="font-semibold text-white">Administrator Account</p>
                        <p className="text-xs text-[#94a3b8] mt-1">
                          Admins automatically have access to all modules including User Management. Change role to{" "}
                          <strong className="text-white">staff</strong> above if you want to restrict them to specific modules.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
                          <Input
                            value={moduleSearch}
                            onChange={(e) => setModuleSearch(e.target.value)}
                            placeholder="Filter modules..."
                            className="pl-9 h-9 bg-[#0e131d] border-[#1e2740] text-white placeholder:text-[#64748b] focus-visible:ring-[#00e5ff]"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={selectAllModules}
                            className="bg-[#0e131d] border-[#1e2740] text-[#e2e8f0] hover:bg-white/5 hover:text-white"
                          >
                            <CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Select All
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={clearAllModules}
                            className="bg-[#0e131d] border-[#1e2740] text-[#e2e8f0] hover:bg-white/5 hover:text-white"
                          >
                            <Square className="w-3.5 h-3.5 mr-1.5" /> Clear All
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                        {filteredModules.map((mod) => {
                          const checked = draftPermissions.includes(mod.key);
                          return (
                            <label
                              key={mod.key}
                              className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                                checked
                                  ? "border-[#00e5ff]/60 bg-[#00e5ff]/10"
                                  : "border-[#1e2740] bg-[#0e131d]/60 hover:bg-white/5"
                              }`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleModule(mod.key)}
                                className="mt-0.5 border-[#334155] data-[state=checked]:bg-[#00e5ff] data-[state=checked]:text-[#0a0e17] data-[state=checked]:border-[#00e5ff]"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white">{mod.label}</p>
                                <p className="text-[11px] text-[#94a3b8] line-clamp-2 mt-0.5">
                                  {mod.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#1e2740]">
                        <span className="text-xs text-[#94a3b8]">
                          {draftPermissions.length} module(s) selected (+ Attention Dashboard home)
                        </span>
                        <Button
                          onClick={handleSavePermissions}
                          disabled={saving}
                          className="bg-[#00e5ff] hover:bg-[#00c3d7] text-[#0a0e17] font-semibold"
                        >
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
      </div>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md bg-[#131926] border-[#1e2740] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Add Registered User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-[#94a3b8]">User ID (optional)</Label>
                <Input
                  value={newUser.id}
                  onChange={(e) => setNewUser({ ...newUser, id: e.target.value })}
                  placeholder="e.g. usr-staff-02"
                  className="mt-1 bg-[#0e131d] border-[#1e2740] text-white"
                />
              </div>
              <div>
                <Label className="text-xs text-[#94a3b8]">Avatar Initials</Label>
                <Input
                  value={newUser.avatar_initials}
                  onChange={(e) => setNewUser({ ...newUser, avatar_initials: e.target.value })}
                  placeholder="e.g. JD"
                  maxLength={4}
                  className="mt-1 bg-[#0e131d] border-[#1e2740] text-white"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-[#94a3b8]">Full Name *</Label>
              <Input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="John Doe"
                required
                className="mt-1 bg-[#0e131d] border-[#1e2740] text-white"
              />
            </div>
            <div>
              <Label className="text-xs text-[#94a3b8]">Email *</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="john@wmg.local"
                required
                className="mt-1 bg-[#0e131d] border-[#1e2740] text-white"
              />
            </div>
            <div>
              <Label className="text-xs text-[#94a3b8]">Password *</Label>
              <Input
                type="text"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Enter password"
                required
                className="mt-1 bg-[#0e131d] border-[#1e2740] text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-[#94a3b8]">Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(val) => setNewUser({ ...newUser, role: val })}
                >
                  <SelectTrigger className="mt-1 bg-[#0e131d] border-[#1e2740] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#131926] border-[#1e2740] text-white">
                    <SelectItem value="staff">staff</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-[#94a3b8]">Role Label</Label>
                <Input
                  value={newUser.role_label}
                  onChange={(e) => setNewUser({ ...newUser, role_label: e.target.value })}
                  placeholder="QA Officer"
                  className="mt-1 bg-[#0e131d] border-[#1e2740] text-white"
                />
              </div>
              <div>
                <Label className="text-xs text-[#94a3b8]">Dept</Label>
                <Input
                  value={newUser.dept}
                  onChange={(e) => setNewUser({ ...newUser, dept: e.target.value })}
                  placeholder="QA/QC"
                  className="mt-1 bg-[#0e131d] border-[#1e2740] text-white"
                />
              </div>
            </div>
            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                className="bg-[#0e131d] border-[#1e2740] text-[#e2e8f0] hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="bg-[#00e5ff] hover:bg-[#00c3d7] text-[#0a0e17] font-semibold"
              >
                {creating ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
