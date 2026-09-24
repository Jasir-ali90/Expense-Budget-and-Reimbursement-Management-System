import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ToastStack from './components/ToastStack';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import PaymentsPage from './pages/PaymentsPage';
import ApprovalsPage from './pages/ApprovalsPage';

import ClaimListPage from './pages/claims/ClaimListPage';
import ClaimFormPage from './pages/claims/ClaimFormPage';
import ClaimDetailPage from './pages/claims/ClaimDetailPage';

import ExpenseListPage from './pages/expenses/ExpenseListPage';
import ExpenseFormPage from './pages/expenses/ExpenseFormPage';

import BudgetListPage from './pages/budgets/BudgetListPage';
import BudgetFormPage from './pages/budgets/BudgetFormPage';

import UsersPage from './pages/admin/UsersPage';
import DepartmentsPage from './pages/admin/DepartmentsPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import SettingsPage from './pages/admin/SettingsPage';
import AuditLogPage from './pages/admin/AuditLogPage';

import ReportsPage from './pages/ReportsPage';

const FINANCE = ['Admin', 'Finance Manager'];
const ALL = ['Admin', 'Finance Manager', 'Employee'];

/** Authenticated page wrapper: role guard + Layout shell + toast stack. */
const Page = ({ roles, title, children }) => (
  <ProtectedRoute roles={roles}>
    <Layout title={title}>
      {children}
      <ToastStack />
    </Layout>
  </ProtectedRoute>
);

const App = () => (
  <Routes>
    {/* Public */}
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<Navigate to="/dashboard" replace />} />

    {/* All roles */}
    <Route path="/dashboard" element={<Page roles={ALL} title="Dashboard"><DashboardPage /></Page>} />
    <Route path="/profile" element={<Page roles={ALL} title="Profile"><ProfilePage /></Page>} />
    <Route path="/notifications" element={<Page roles={ALL} title="Notifications"><NotificationsPage /></Page>} />

    {/* Claims - all roles (employees see only their own via the API) */}
    <Route path="/claims" element={<Page roles={ALL} title="Claims"><ClaimListPage /></Page>} />
    <Route path="/claims/new" element={<Page roles={ALL} title="New claim"><ClaimFormPage /></Page>} />
    <Route path="/claims/:id" element={<Page roles={ALL} title="Claim detail"><ClaimDetailPage /></Page>} />
    <Route path="/claims/:id/edit" element={<Page roles={ALL} title="Edit claim"><ClaimFormPage /></Page>} />

    {/* Finance manager / Admin */}
    <Route path="/payments" element={<Page roles={FINANCE} title="Payments"><PaymentsPage /></Page>} />
    <Route path="/approvals" element={<Page roles={FINANCE} title="Approvals"><ApprovalsPage /></Page>} />
    <Route path="/expenses" element={<Page roles={FINANCE} title="Expenses"><ExpenseListPage /></Page>} />
    <Route path="/expenses/new" element={<Page roles={FINANCE} title="New expense"><ExpenseFormPage /></Page>} />
    <Route path="/expenses/:id" element={<Page roles={FINANCE} title="Expense detail"><ExpenseFormPage /></Page>} />
    <Route path="/budgets" element={<Page roles={FINANCE} title="Budgets"><BudgetListPage /></Page>} />
    <Route path="/budgets/new" element={<Page roles={['Admin']} title="New budget"><BudgetFormPage /></Page>} />
    <Route path="/budgets/:id/edit" element={<Page roles={['Admin']} title="Edit budget"><BudgetFormPage /></Page>} />
    <Route path="/reports" element={<Page roles={FINANCE} title="Reports"><ReportsPage /></Page>} />
    <Route path="/admin/audit-logs" element={<Page roles={FINANCE} title="Audit log"><AuditLogPage /></Page>} />

    {/* Admin only */}
    <Route path="/admin/users" element={<Page roles={['Admin']} title="Users"><UsersPage /></Page>} />
    <Route path="/admin/departments" element={<Page roles={['Admin']} title="Departments"><DepartmentsPage /></Page>} />
    <Route path="/admin/categories" element={<Page roles={['Admin']} title="Categories"><CategoriesPage /></Page>} />
    <Route path="/admin/settings" element={<Page roles={['Admin']} title="Settings"><SettingsPage /></Page>} />

    {/* Fallback */}
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

export default App;
