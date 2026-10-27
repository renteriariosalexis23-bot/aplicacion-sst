import React, { useState, useEffect, Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate, useLocation,
} from "react-router-dom";
import { WifiOff } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import { CompanyProvider } from "./CompanyContext";
import { Toaster } from "react-hot-toast";
































import { useKeyboardNavigation } from "./utils/useKeyboardNavigation";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { isMainAdmin } from "./constants/admin";
import { isDispatchWorker } from "./constants/navigation";


// Vehículos y Pre-Uso: un trabajador solo entra si es de Despacho (motorizado)
const DispatchOnly: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { profile } = useAuth();
  if (profile?.role === "worker" && !isDispatchWorker(profile)) return <Navigate to="/" replace />;
  return children;
};


const Login = lazy(() => import("./components/Login").then(m => ({ default: m.Login })));
const Layout = lazy(() => import("./components/Layout").then(m => ({ default: m.Layout })));
const Feed = lazy(() => import("./components/Feed").then(m => ({ default: m.Feed })));
const Home = lazy(() => import("./components/Home").then(m => ({ default: m.Home })));
const Documents = lazy(() => import("./components/Documents").then(m => ({ default: m.Documents })));
const Reports = lazy(() => import("./components/Reports").then(m => ({ default: m.Reports })));
const Profile = lazy(() => import("./components/Profile").then(m => ({ default: m.Profile })));
const Users = lazy(() => import("./components/Users").then(m => ({ default: m.Users })));
const Dashboard = lazy(() => import("./components/Dashboard").then(m => ({ default: m.Dashboard })));
const ManagementMeetings = lazy(() => import("./components/ManagementMeetings").then(m => ({ default: m.ManagementMeetings })));
const Trainings = lazy(() => import("./components/Trainings").then(m => ({ default: m.Trainings })));
const Inspections = lazy(() => import("./components/Inspections").then(m => ({ default: m.Inspections })));
const AnnualProgram = lazy(() => import("./components/AnnualProgram").then(m => ({ default: m.AnnualProgram })));
const Committee = lazy(() => import("./components/Committee").then(m => ({ default: m.Committee })));
const Suggestions = lazy(() => import("./components/Suggestions").then(m => ({ default: m.Suggestions })));
const MandatoryRegisters = lazy(() => import("./components/MandatoryRegisters").then(m => ({ default: m.MandatoryRegisters })));
const Companies = lazy(() => import("./components/Companies").then(m => ({ default: m.Companies })));
const MedicalExamsManager = lazy(() => import("./components/MedicalExamsManager").then(m => ({ default: m.MedicalExamsManager })));
const PendingApproval = lazy(() => import("./components/PendingApproval").then(m => ({ default: m.PendingApproval })));
const ProfileCompleter = lazy(() => import("./components/ProfileCompleter").then(m => ({ default: m.ProfileCompleter })));
const Equipments = lazy(() => import("./components/Equipments").then(m => ({ default: m.Equipments })));
const Epps = lazy(() => import("./components/Epps").then(m => ({ default: m.Epps })));
const PreUse = lazy(() => import("./components/PreUse").then(m => ({ default: m.PreUse })));
const SstStatistics = lazy(() => import("./components/SstStatistics").then(m => ({ default: m.SstStatistics })));
const Inductions = lazy(() => import("./components/Inductions").then(m => ({ default: m.Inductions })));
const Drills = lazy(() => import("./components/Drills").then(m => ({ default: m.Drills })));
const Vehicles = lazy(() => import("./components/Vehicles").then(m => ({ default: m.Vehicles })));
const QRLanding = lazy(() => import("./components/QRLanding").then(m => ({ default: m.QRLanding })));



const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!user) {
    sessionStorage.setItem("redirectPath", location.pathname + location.search);
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const LoginRoute: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (user) {
    let from = location.state?.from?.pathname + (location.state?.from?.search || "");
    if (!from || from === "undefined" || from === "null") {
       from = sessionStorage.getItem("redirectPath") || "/";
    }
    sessionStorage.removeItem("redirectPath");
    return <Navigate to={from} replace />;
  }

  return <Login />;
};

const AppContent: React.FC = () => {
  useKeyboardNavigation();
  const { user, profile, loading } = useAuth();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      setIsSyncing(true);
      try {
        const { syncPendingInspections } = await import("./utils/offlineSync");
        await syncPendingInspections();
      } catch (e) {
        console.error("Error al sincronizar datos offline:", e);
      } finally {
        setIsSyncing(false);
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Si la app carga y ya hay red, tratar de sincronizar lo pendiente silentiomente.
    if (navigator.onLine) {
      handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If user is logged in but not linked to a company (and not the main admin / super_admin / employer / gerencia), show PendingApproval
  if (
    user &&
    profile &&
    profile.role !== "employer" &&
    profile.role !== "super_admin" &&
    profile.role !== "gerencia" &&
    !profile.companyRuc &&
    !isMainAdmin(profile.email)
  ) {
    return <PendingApproval />;
  }

  // If user is logged in but hasn't completed their profile (department/position/dni/name)
  if (user && profile && (!profile.department || !profile.position || !profile.displayName || !profile.dni)) {
    return <ProfileCompleter />;
  }

  return (
    <ErrorBoundary>
      <Toaster 
        position="top-right" 
        toastOptions={{
          duration: 3000,
        }}
        
      />
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white text-xs font-bold py-1 px-4 text-center z-[100] flex items-center justify-center gap-2 shadow-md h-8 transition-colors">
          <WifiOff className="w-4 h-4" />
          Modo Sin Conexión. Los cambios se guardarán cuando vuelvas a tener
          internet.
        </div>
      )}
      {!isOffline && isSyncing && (
        <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white text-xs font-bold py-1 px-4 text-center z-[100] flex items-center justify-center gap-2 shadow-md h-8 transition-colors">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
          Sincronizando información pendiente con la nube...
        </div>
      )}
      <div className={isOffline || isSyncing ? "pt-8" : ""}>
        <Router>
          <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <p className="text-slate-500 font-medium text-sm">Cargando...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Home />} />
                <Route path="muro" element={<Feed />} />
                <Route path="documents" element={<Documents />} />
                <Route path="reports" element={<Reports />} />
                <Route path="profile" element={<Profile />} />
                <Route path="annual-program" element={<AnnualProgram />} />
                <Route path="management-meetings" element={<ManagementMeetings />} />
                <Route path="committee" element={<Committee />} />
                <Route path="users" element={<Users />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="medical-exams" element={<MedicalExamsManager />} />
                <Route path="trainings" element={<Trainings />} />
                <Route path="inspections" element={<Inspections />} />
                <Route path="epps" element={<Epps />} />
                <Route path="preuse" element={<DispatchOnly><PreUse /></DispatchOnly>} />
                <Route path="qr" element={<QRLanding />} />
                <Route path="equipments" element={<Equipments />} />
                <Route path="suggestions" element={<Suggestions />} />
                <Route
                  path="mandatory-registers"
                  element={<MandatoryRegisters />}
                />
                <Route path="companies" element={<Companies />} />
                <Route path="sst-statistics" element={<SstStatistics />} />
                <Route path="inductions" element={<Inductions />} />
                <Route path="drills" element={<Drills />} />
                <Route path="vehicles" element={<DispatchOnly><Vehicles /></DispatchOnly>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </div>
    </ErrorBoundary>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <AppContent />
      </CompanyProvider>
    </AuthProvider>
  );
}
