import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { ErrorBoundary } from './components/ErrorBoundary';

// Operations
const Home = lazy(() => import('./pages/operations/Home'));
const AttentionDashboard = lazy(() => import('./pages/operations/AttentionDashboard'));
const RequestsStoppages = lazy(() => import('./pages/operations/RequestsStoppages'));
const TaskMatrix = lazy(() => import('./pages/operations/TaskMatrix'));
const OvertimeRecord = lazy(() => import('./pages/operations/OvertimeRecord'));
const OperationLogs = lazy(() => import('./pages/operations/OperationLogs'));
const WastageLogs = lazy(() => import('./pages/operations/WastageLogs'));
const BaselineCapacity = lazy(() => import('./pages/operations/BaselineCapacity'));
const ShiftLogDraft = lazy(() => import('./pages/operations/ShiftLogDraft'));
const ProductionLineLogs = lazy(() => import('./pages/operations/ProductionLineLogs'));

// Planning & Procurement
const DemandPlanner = lazy(() => import('./pages/planning/DemandPlanner'));
const ProductionOrders = lazy(() => import('./pages/planning/ProductionOrders'));
const ProductionSchedule = lazy(() => import('./pages/planning/ProductionSchedule'));
const Procurement = lazy(() => import('./pages/planning/Procurement'));

// Batches, Labels & Traceability
const CreateBatch = lazy(() => import('./pages/batches/CreateBatch'));
const BarcodeLookup = lazy(() => import('./pages/batches/BarcodeLookup'));
const Traceability = lazy(() => import('./pages/batches/Traceability'));

// QA / QC & Loss Control
const QaHaccp = lazy(() => import('./pages/qaqc/QaHaccp'));
const QueryViewer = lazy(() => import('./pages/qaqc/QueryViewer'));
const CapaTracker = lazy(() => import('./pages/qaqc/CapaTracker'));
const YieldLoss = lazy(() => import('./pages/qaqc/YieldLoss'));

// Raw & Packaging Inventory
const PackagingStock = lazy(() => import('./pages/inventory/PackagingStock'));

// Finished Goods WMS
const WmsWarehouse = lazy(() => import('./pages/wms/WmsWarehouse'));

// Master Data & Entry
const ProductMaster = lazy(() => import('./pages/masters/ProductMaster'));
const RecipeMaster = lazy(() => import('./pages/masters/RecipeMaster'));

// System Admin & Governance
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const DataImport = lazy(() => import('./pages/admin/DataImport'));
const AuditTrailLog = lazy(() => import('./pages/admin/AuditTrailLog'));
const RecentlyDeletedOrders = lazy(() => import('./pages/admin/RecentlyDeletedOrders'));

import Layout from './components/Layout';
import ModuleGuard from './components/ModuleGuard';
import AccessGate from './components/AccessGate';

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0e17]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render the main app
  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      {/* Add your page Route elements here */}
      <Route element={<AccessGate />}>
      <Route element={<Layout />}>
        <Route element={<ModuleGuard />}>
          <Route path="/" element={<AttentionDashboard />} />
          <Route path="/operations-overview" element={<Home />} />
          <Route path="/downtime" element={<RequestsStoppages />} />
          <Route path="/qa-haccp" element={<QaHaccp />} />
          <Route path="/queries" element={<QueryViewer />} />
          <Route path="/task-matrix" element={<TaskMatrix />} />
          <Route path="/capa-tracker" element={<CapaTracker />} />
          <Route path="/audit-trail" element={<AuditTrailLog />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/data-import" element={<DataImport />} />
          <Route path="/overtime-record" element={<OvertimeRecord />} />
          <Route path="/operation-logs" element={<OperationLogs />} />
          <Route path="/wastage-logs" element={<WastageLogs />} />
          <Route path="/baseline-capacity" element={<BaselineCapacity />} />
          <Route path="/shift-log-draft" element={<ShiftLogDraft />} />
          <Route path="/production-line-logs" element={<ProductionLineLogs />} />
          <Route path="/yield-loss" element={<YieldLoss />} />
          <Route path="/packaging-stock" element={<PackagingStock />} />
          <Route path="/packaging-movements" element={<Navigate to="/packaging-stock?tab=movements" replace />} />
          <Route path="/packaging-approvals" element={<Navigate to="/packaging-stock" replace />} />
          <Route path="/pic-product-entry" element={<Navigate to="/product-master" replace />} />
          <Route path="/product-master" element={<ProductMaster />} />
          <Route path="/recipe-master" element={<RecipeMaster />} />
          <Route path="/production-orders" element={<ProductionOrders />} />
          <Route path="/production-schedule" element={<ProductionSchedule />} />
          <Route path="/create-batch" element={<CreateBatch />} />
          <Route path="/batch-records" element={<Navigate to="/create-batch?tab=records" replace />} />
          <Route path="/traceability" element={<Traceability />} />
          <Route path="/demand-planner" element={<DemandPlanner />} />
          <Route path="/procurement" element={<Procurement />} />
          <Route path="/batch-scan" element={<BarcodeLookup />} />
          <Route path="/wms" element={<WmsWarehouse />} />
          <Route path="/sheet-migration" element={<Navigate to="/data-import" replace />} />
          <Route path="/insert-data" element={<Navigate to="/product-master" replace />} />
          <Route path="/recently-deleted" element={<RecentlyDeletedOrders />} />
        </Route>
      </Route>
      </Route>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Navigate to="/" replace />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
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