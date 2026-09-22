import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import ProductsPage from '@/pages/products/ProductsPage';
import CategoriesPage from '@/pages/products/CategoriesPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import PurchasesPage from '@/pages/purchases/PurchasesPage';
import InventoryPeriodsPage from '@/pages/inventory/InventoryPeriodsPage';
import InventoryDetailPage from '@/pages/inventory/InventoryDetailPage';
import StockTransfersPage from '@/pages/inventory/StockTransfersPage';
import AccountingPage from '@/pages/accounting/AccountingPage';
import FinancialReportsPage from '@/pages/financial-reports/FinancialReportsPage';
import LaborPage from '@/pages/labor/LaborPage';
import RepairsPage from '@/pages/repairs/RepairsPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { Permission } from '@/lib/permissions';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/inventory" element={<InventoryPeriodsPage />} />
        <Route path="/inventory/:periodId" element={<InventoryDetailPage />} />
        <Route 
          path="/stock-transfers" 
          element={
            <ProtectedRoute permission={Permission.MANAGE_TRANSFERS}>
              <StockTransfersPage />
            </ProtectedRoute>
          } 
        />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/financial-reports" element={<FinancialReportsPage />} />
        <Route path="/labor" element={<LaborPage />} />
        <Route path="/repairs" element={<RepairsPage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute permission={Permission.ACCESS_SETTINGS}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
