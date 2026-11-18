import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { ErrorBoundary } from './components/ErrorBoundary';
// Operations
import Home from './pages/operations/Home';
import AttentionDashboard from './pages/operations/AttentionDashboard';
import RequestsStoppages from './pages/operations/RequestsStoppages';
import Staffing from './pages/operations/Staffing';
import TaskMatrix from './pages/operations/TaskMatrix';
import KpiScorecards from './pages/operations/KpiScorecards';
import OvertimeRecord from './pages/operations/OvertimeRecord';
import OperationLogs from './pages/operations/OperationLogs';
import WastageLogs from './pages/operations/WastageLogs';
import BaselineCapacity from './pages/operations/BaselineCapacity';
import ShiftLogDraft from './pages/operations/ShiftLogDraft';
import ProductionLineLogs from './pages/operations/ProductionLineLogs';

// Planning & Procurement
import DemandPlanner from './pages/planning/DemandPlanner';
import ProductionOrders from './pages/planning/ProductionOrders';
import ProductionSchedule from './pages/planning/ProductionSchedule';
import Procurement from './pages/planning/Procurement';

// Batches, Labels & Traceability
import CreateBatch from './pages/batches/CreateBatch';
import BatchRecords from './pages/batches/BatchRecords';
import BarcodeLookup from './pages/batches/BarcodeLookup';
import Traceability from './pages/batches/Traceability';

// QA / QC & Loss Control
import QaHaccp from './pages/qaqc/QaHaccp';
import CapaTracker from './pages/qaqc/CapaTracker';
import YieldLoss from './pages/qaqc/YieldLoss';

// Raw & Packaging Inventory
import GoodsReceiving from './pages/inventory/GoodsReceiving';
import GoodsTracker from './pages/inventory/GoodsTracker';
import GoodsIssued from './pages/inventory/GoodsIssued';
import PackagingStock from './pages/inventory/PackagingStock';
import PackagingMovements from './pages/inventory/PackagingMovements';
import PackagingApprovals from './pages/inventory/PackagingApprovals';

// Finished Goods WMS
import WmsWarehouse from './pages/wms/WmsWarehouse';

// Master Data & Entry
import ProductMaster from './pages/masters/ProductMaster';
import PicProductEntry from './pages/masters/PicProductEntry';
import RecipeMaster from './pages/masters/RecipeMaster';
import Machines from './pages/masters/Machines';
import InsertData from './pages/masters/InsertData';

// System Admin & Governance
import UserManagement from './pages/admin/UserManagement';
import DataImport from './pages/admin/DataImport';
import SheetMigration from './pages/admin/SheetMigration';
import AuditTrailLog from './pages/admin/AuditTrailLog';
import ActivityHistory from './pages/admin/ActivityHistory';
import ActivityLogs from './pages/admin/ActivityLogs';
import RecentlyDeletedOrders from './pages/admin/RecentlyDeletedOrders';

// Auth
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Layout from './components/Layout';
import ModuleGuard from './components/ModuleGuard';
import AccessGate from './components/AccessGate';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login disabled for now
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route element={<AccessGate />}>
      <Route element={<Layout />}>
        <Route element={<ModuleGuard />}>
          <Route path="/" element={<AttentionDashboard />} />
          <Route path="/operations-overview" element={<Home />} />
          <Route path="/downtime" element={<RequestsStoppages />} />
          <Route path="/staffing" element={<Staffing />} />
          <Route path="/qa-haccp" element={<QaHaccp />} />
          <Route path="/task-matrix" element={<TaskMatrix />} />
          <Route path="/capa-tracker" element={<CapaTracker />} />
          <Route path="/kpi-scorecards" element={<KpiScorecards />} />
          <Route path="/audit-trail" element={<AuditTrailLog />} />
          <Route path="/activity-history" element={<ActivityHistory />} />
          <Route path="/activity-logs" element={<ActivityLogs />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/data-import" element={<DataImport />} />
          <Route path="/overtime-record" element={<OvertimeRecord />} />
          <Route path="/operation-logs" element={<OperationLogs />} />
          <Route path="/wastage-logs" element={<WastageLogs />} />
          <Route path="/baseline-capacity" element={<BaselineCapacity />} />
          <Route path="/shift-log-draft" element={<ShiftLogDraft />} />
          <Route path="/production-line-logs" element={<ProductionLineLogs />} />
          <Route path="/yield-loss" element={<YieldLoss />} />
          <Route path="/goods-receiving" element={<GoodsReceiving />} />
          <Route path="/goods-tracker" element={<GoodsTracker />} />
          <Route path="/goods-issued" element={<GoodsIssued />} />
          <Route path="/packaging-stock" element={<PackagingStock />} />
          <Route path="/packaging-movements" element={<PackagingMovements />} />
          <Route path="/packaging-approvals" element={<PackagingApprovals />} />
          <Route path="/pic-product-entry" element={<PicProductEntry />} />
          <Route path="/product-master" element={<ProductMaster />} />
          <Route path="/recipe-master" element={<RecipeMaster />} />
          <Route path="/machines" element={<Machines />} />
          <Route path="/production-orders" element={<ProductionOrders />} />
          <Route path="/production-schedule" element={<ProductionSchedule />} />
          <Route path="/create-batch" element={<CreateBatch />} />
          <Route path="/batch-records" element={<BatchRecords />} />
          <Route path="/traceability" element={<Traceability />} />
          <Route path="/demand-planner" element={<DemandPlanner />} />
          <Route path="/procurement" element={<Procurement />} />
          <Route path="/batch-scan" element={<BarcodeLookup />} />
          <Route path="/wms" element={<WmsWarehouse />} />
          <Route path="/sheet-migration" element={<SheetMigration />} />
          <Route path="/insert-data" element={<InsertData />} />
          <Route path="/recently-deleted" element={<RecentlyDeletedOrders />} />
        </Route>
      </Route>
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App