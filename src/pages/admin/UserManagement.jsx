import React, { useEffect, useMemo, useState } from "react";
import {
  listAllUsers,
  updateUserPermissions,
  updateUserDetails,
  createUserRecord,
} from "@/services/authService";
import { useAuth } from "@/lib/AuthContext";
import {
  APP_ROLES,
  MODULES,
  ASSIGNABLE_MODULE_KEYS,
  isAdminUser,
  effectiveModuleKeys,
} from "@/lib/permissions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  SlidersHorizontal,
  Building2,
  UserCheck,
  Shield,
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
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [moduleSearch, setModuleSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

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
      if (selectedUserId) {
        const refreshed = list.find((u) => u.id === selectedUserId);
        if (refreshed) {
          setDraftPermissions(initialDraftForUser(refreshed));
        }
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

  const openUserDrawer = (u) => {
    setSelectedUserId(u.id);
    setDraftPermissions(initialDraftForUser(u));
    setModuleSearch("");
    setFeedback(null);
    setDrawerOpen(true);
  };

  const departments = useMemo(() => {
    return [...new Set(users.map((u) => u.dept).filter(Boolean))].sort();
  }, [users]);

  const stats = useMemo(() => {
    const admins = users.filter((u) => isAdminUser(u)).length;
    const staff = users.length - admins;
    return {
      total: users.length,
      admins,
      staff,
      depts: departments.length,
    };
  }, [users, departments]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter === "admin" && !isAdminUser(u)) return false;
      if (roleFilter === "staff" && isAdminUser(u)) return false;
      if (deptFilter !== "all" && (u.dept || "") !== deptFilter) return false;
      if (!q) return true;
      return (
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.dept || "").toLowerCase().includes(q) ||
        (u.role_label || "").toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, deptFilter]);

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
      openUserDrawer(created);
    } catch (err) {
      const msg = err?.message || "Failed to create user.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  if (!isAdminUser(currentUser)) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 flex items-start justify-center">
        <div className="max-w-xl w-full bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-base font-semibold text-[#0F294A]">Admin Access Required</h2>
          <p className="text-sm text-[#64748B] mt-1">
            Only administrators can view and manage user module access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-[#1D4ED8] shrink-0" />
            User &amp; Module Access
          </h2>
          <p className="text-[#64748B] text-sm mt-1">
            Manage registered users, roles, and module permissions. Changes save directly to Supabase.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadUsers(true)}
            disabled={loading}
            className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="bg-[#0F294A] hover:bg-[#193B68] text-white"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add User
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748B]">Total Users</p>
            <p className="text-2xl font-bold text-[#0F294A] mt-1">{stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748B]">Administrators</p>
            <p className="text-2xl font-bold text-[#0F294A] mt-1">{stats.admins}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748B]">Staff Accounts</p>
            <p className="text-2xl font-bold text-[#0F294A] mt-1">{stats.staff}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] text-[#334155] flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748B]">Departments</p>
            <p className="text-2xl font-bold text-[#0F294A] mt-1">{stats.depts}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#FFFBEB] text-[#D97706] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] px-4 py-3 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <span className="text-[11px] text-[#64748B]">Search</span>
          <div className="relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, department, or role..."
              className="pl-9 bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-full"
            />
          </div>
        </div>

        <div className="w-full sm:w-[160px] space-y-1">
          <span className="text-[11px] text-[#64748B]">Role</span>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0] text-[#0F294A]">
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[180px] space-y-1">
          <span className="text-[11px] text-[#64748B]">Department</span>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0] text-[#0F294A]">
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* User Directory: Table on md+, Cards on mobile */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#64748B]">
            No matching users found.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-[#E2E8F0]">
              {filteredUsers.map((u) => {
                const admin = isAdminUser(u);
                const modCount = admin ? MODULES.length : effectiveModuleKeys(u).length;
                return (
                  <div key={u.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-bold text-xs flex items-center justify-center shrink-0">
                          {u.avatar_initials || "U"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-[#0F294A] truncate">
                              {u.name}
                            </span>
                            <Badge
                              className={`text-[10px] capitalize ${
                                admin
                                  ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] hover:bg-[#EFF6FF]"
                                  : "bg-[#F1F5F9] text-[#334155] border border-[#E2E8F0] hover:bg-[#F1F5F9]"
                              }`}
                            >
                              {u.role}
                            </Badge>
                          </div>
                          <p className="text-xs text-[#64748B] truncate mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                      <span>
                        {[u.role_label, u.dept].filter(Boolean).join(" · ") || "No department"}
                      </span>
                      <span className="font-medium text-[#0F294A]">
                        {admin ? "All modules" : `${modCount} modules`}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openUserDrawer(u)}
                      className="w-full bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                      Manage Role &amp; Access
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Desktop / Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent bg-[#F8FAFC]">
                    <TableHead className="text-[#64748B]">User</TableHead>
                    <TableHead className="text-[#64748B]">Email</TableHead>
                    <TableHead className="text-[#64748B]">Role Label &amp; Dept</TableHead>
                    <TableHead className="text-[#64748B]">Access Level</TableHead>
                    <TableHead className="text-[#64748B]">Modules</TableHead>
                    <TableHead className="text-[#64748B] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const admin = isAdminUser(u);
                    const modCount = admin ? MODULES.length : effectiveModuleKeys(u).length;
                    return (
                      <TableRow
                        key={u.id}
                        className="border-[#E2E8F0] hover:bg-[#F8FAFC] cursor-pointer"
                        onClick={() => openUserDrawer(u)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-bold text-xs flex items-center justify-center shrink-0">
                              {u.avatar_initials || "U"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-[#0F294A] truncate">{u.name}</p>
                              <p className="text-[11px] text-[#64748B] truncate">{u.id}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-[#334155]">{u.email}</TableCell>
                        <TableCell className="text-sm text-[#64748B]">
                          {[u.role_label, u.dept].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs capitalize ${
                              admin
                                ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] hover:bg-[#EFF6FF]"
                                : "bg-[#F1F5F9] text-[#334155] border border-[#E2E8F0] hover:bg-[#F1F5F9]"
                            }`}
                          >
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-[#0F294A]">
                          {admin ? `All (${MODULES.length})` : `${modCount} modules`}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUserDrawer(u);
                            }}
                            className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                            Manage Access
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Slide-over Permission & Role Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl bg-white border-l border-[#E2E8F0] text-[#0F294A] flex flex-col p-0 overflow-hidden"
        >
          {selectedUser && (
            <>
              <SheetHeader className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] text-left shrink-0">
                <div className="flex items-start justify-between gap-3 pr-6">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-bold text-sm flex items-center justify-center shrink-0">
                      {selectedUser.avatar_initials || "U"}
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="text-base font-semibold text-[#0F294A] truncate">
                        {selectedUser.name}
                      </SheetTitle>
                      <SheetDescription className="text-xs text-[#64748B] truncate mt-0.5">
                        {selectedUser.email}
                        {selectedUser.dept ? ` · ${selectedUser.dept}` : ""}
                      </SheetDescription>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                  <span className="text-xs font-medium text-[#64748B]">Account Role</span>
                  <Select
                    value={selectedUser.role}
                    onValueChange={(val) => handleRoleChange(selectedUser, val)}
                    disabled={selectedUser.id === currentUser?.id}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs bg-white border-[#E2E8F0] text-[#0F294A]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E2E8F0] text-[#0F294A]">
                      <SelectItem value="staff">staff</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {feedback && (
                  <div
                    className={`p-3 rounded-lg border flex items-center gap-2.5 text-sm ${
                      feedback.type === "success"
                        ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]"
                        : "bg-rose-50 border-rose-200 text-rose-700"
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
                  <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
                    <div className="text-sm text-[#334155]">
                      <p className="font-semibold text-[#0F294A]">Administrator Account</p>
                      <p className="text-xs text-[#64748B] mt-1">
                        Admins automatically have access to all modules including User Management. Change role to{" "}
                        <strong className="text-[#0F294A]">staff</strong> above to restrict them to specific modules.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          value={moduleSearch}
                          onChange={(e) => setModuleSearch(e.target.value)}
                          placeholder="Filter modules..."
                          className="pl-9 h-9 bg-white border-[#E2E8F0] text-[#0F294A]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={selectAllModules}
                          className="flex-1 sm:flex-none bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
                        >
                          <CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearAllModules}
                          className="flex-1 sm:flex-none bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
                        >
                          <Square className="w-3.5 h-3.5 mr-1.5" /> Clear All
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {filteredModules.map((mod) => {
                        const checked = draftPermissions.includes(mod.key);
                        return (
                          <label
                            key={mod.key}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                              checked
                                ? "border-[#1D4ED8]/50 bg-[#EFF6FF]"
                                : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleModule(mod.key)}
                              className="mt-0.5 border-[#CBD5E1] data-[state=checked]:bg-[#0F294A] data-[state=checked]:text-white data-[state=checked]:border-[#0F294A]"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#0F294A]">{mod.label}</p>
                              <p className="text-[11px] text-[#64748B] line-clamp-2 mt-0.5">
                                {mod.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {!isAdminUser(selectedUser) && (
                <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
                  <span className="text-xs text-[#64748B]">
                    {draftPermissions.length} module(s) selected (+ Attention Dashboard)
                  </span>
                  <Button
                    onClick={handleSavePermissions}
                    disabled={saving}
                    className="w-full sm:w-auto bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold"
                  >
                    <Save className="w-4 h-4 mr-1.5" />
                    {saving ? "Saving..." : "Save Module Access"}
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto bg-white border-[#E2E8F0] text-[#0F294A]">
          <DialogHeader>
            <DialogTitle className="text-[#0F294A]">Add Registered User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div>
              <Label className="text-xs text-[#64748B]">Full Name *</Label>
              <Input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="John Doe"
                required
                className="mt-1 bg-white border-[#E2E8F0] text-[#0F294A]"
              />
            </div>
            <div>
              <Label className="text-xs text-[#64748B]">Email *</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="john@wmg.local"
                required
                className="mt-1 bg-white border-[#E2E8F0] text-[#0F294A]"
              />
            </div>
            <div>
              <Label className="text-xs text-[#64748B]">Password *</Label>
              <Input
                type="text"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Enter password"
                required
                className="mt-1 bg-white border-[#E2E8F0] text-[#0F294A]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-[#64748B]">Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(val) => setNewUser({ ...newUser, role: val })}
                >
                  <SelectTrigger className="mt-1 bg-white border-[#E2E8F0] text-[#0F294A]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E2E8F0] text-[#0F294A]">
                    <SelectItem value="staff">staff</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-[#64748B]">Role Label</Label>
                <div className="mt-1">
                  <SearchableSelect
                    value={newUser.role_label}
                    onValueChange={(val) => setNewUser({ ...newUser, role_label: val })}
                    options={[...new Set(["Administrator", ...APP_ROLES.map((r) => r.label), ...users.map((u) => u.role_label).filter(Boolean)])]}
                    placeholder="Select role..."
                    searchPlaceholder="Search role..."
                    allowCustom
                    className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F8FAFC]"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#64748B]">Dept</Label>
                <div className="mt-1">
                  <SearchableSelect
                    value={newUser.dept}
                    onValueChange={(val) => setNewUser({ ...newUser, dept: val })}
                    options={[...new Set(["QA/QC", "Production", "Warehouse", "Planning", "Maintenance", "Management", ...users.map((u) => u.dept).filter(Boolean)])]}
                    placeholder="Select dept..."
                    searchPlaceholder="Search dept..."
                    allowCustom
                    className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F8FAFC]"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold"
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
