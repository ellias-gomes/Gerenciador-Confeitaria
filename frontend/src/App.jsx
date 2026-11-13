import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiRequest } from './lib/api';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import IngredientsPage from './pages/IngredientsPage';
import RecipesPage from './pages/RecipesPage';
import OrdersPage from './pages/OrdersPage';
import CustomersPage from './pages/CustomersPage';
import PlannerPage from './pages/PlannerPage';
import AdminPage from './pages/AdminPage';

function MainApp() {
  const { user, loading, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bakeryName, setBakeryName] = useState('Doce Gestão');

  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest('/api/settings');
      if (data?.settings?.bakery_name) {
        setBakeryName(data.settings.bakery_name);
      }
    } catch {
      // ignora erro
    }
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf6] text-sm font-medium text-stone-500">
        Carregando sistema da confeitaria...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'ingredients':
        return <IngredientsPage />;
      case 'recipes':
        return <RecipesPage />;
      case 'orders':
        return <OrdersPage />;
      case 'customers':
        return <CustomersPage />;
      case 'planner':
        return <PlannerPage />;
      case 'admin':
        return hasRole('admin') ? <AdminPage onSettingsSaved={loadSettings} /> : <DashboardPage onNavigate={setActiveTab} />;
      case 'dashboard':
      default:
        return <DashboardPage onNavigate={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} onChangeTab={setActiveTab} bakeryName={bakeryName}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
