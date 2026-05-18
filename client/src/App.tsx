import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ToastContainer } from './components/ui/Toast';
import { getUser } from './utils/auth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import StocksPage from './pages/StocksPage';
import DownloadPage from './pages/DownloadPage';
import QuotesPage from './pages/QuotesPage';
import BacktestPage from './pages/BacktestPage';
import BacktestResultPage from './pages/BacktestResultPage';
import MarketPage from './pages/MarketPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!getUser()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  if (getUser()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Protected routes */}
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="stocks" element={<StocksPage />} />
          <Route path="download" element={<DownloadPage />} />
          <Route path="quotes" element={<QuotesPage />} />
          <Route path="backtest" element={<BacktestPage />} />
          <Route path="backtest/:id" element={<BacktestResultPage />} />
          <Route path="market" element={<MarketPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
