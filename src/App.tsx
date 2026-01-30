import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Income from "./pages/Income";
import Crypto from "./pages/Crypto";
import Deductions from "./pages/Deductions";
import Optimizer from "./pages/Optimizer";
import EFile from "./pages/EFile";
import GSTCenter from "./pages/GSTCenter";
import ClientManagement from "./pages/ClientManagement";
import GuidedFiling from "./pages/GuidedFiling";
import ForeignCompliance from "./pages/ForeignCompliance";
import AuditLogs from "./pages/AuditLogs";
import AISReconciler from "./pages/AISReconciler";
import FamilyDashboard from "./pages/FamilyDashboard";
import TaxVault from "./pages/TaxVault";
import Settings from "./pages/Settings";
import Success from "./pages/Success";
import IncomeOptimizer from "./pages/IncomeOptimizer";
import ProfessionalFirm from "./pages/ProfessionalFirm";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/guided" element={<ProtectedRoute><GuidedFiling /></ProtectedRoute>} />
            <Route path="/gst" element={<ProtectedRoute><GSTCenter /></ProtectedRoute>} />
            <Route path="/foreign" element={<ProtectedRoute><ForeignCompliance /></ProtectedRoute>} />
            <Route path="/ais" element={<ProtectedRoute><AISReconciler /></ProtectedRoute>} />
            <Route path="/family" element={<ProtectedRoute><FamilyDashboard /></ProtectedRoute>} />
            <Route path="/vault" element={<ProtectedRoute><TaxVault /></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute><ClientManagement /></ProtectedRoute>} />
            <Route path="/income" element={<ProtectedRoute><Income /></ProtectedRoute>} />
            <Route path="/crypto" element={<ProtectedRoute><Crypto /></ProtectedRoute>} />
            <Route path="/deductions" element={<ProtectedRoute><Deductions /></ProtectedRoute>} />
            <Route path="/optimizer" element={<ProtectedRoute><Optimizer /></ProtectedRoute>} />
            <Route path="/firm" element={<ProtectedRoute><ProfessionalFirm /></ProtectedRoute>} />
            <Route path="/efile" element={<ProtectedRoute><EFile /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/success" element={<ProtectedRoute><Success /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
