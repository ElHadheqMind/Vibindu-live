import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import LandingPage from './components/Auth/LoginPage'; // Landing page with Request Access
import UserLoginPage from './components/Auth/UserLoginPage'; // Login page for users with credentials
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Lazy load heavy components to avoid side-effects (like Konva initialization) affecting the Login Page
const MainApp = React.lazy(() => import('./components/MainApp'));
const CreateAIProjectPage = React.lazy(() => import('./components/Welcome/CreateAIProjectPage'));
const ServerPage = React.lazy(() => import('./components/Pages/server/ServerPage'));
const ResetAppPage = React.lazy(() => import('./components/Debug/ResetAppPage'));

const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    color: '#1976d2',
    fontFamily: 'sans-serif'
  }}>
    Loading Application...
  </div>
);

import './App.css';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={!isAuthenticated ? <UserLoginPage /> : <Navigate to="/welcome" replace />} />
        <Route path="/landing" element={!isAuthenticated ? <LandingPage /> : <Navigate to="/welcome" replace />} />
        {/* Root route: unauthenticated → login page, authenticated → MainApp (preserves ?project= params) */}
        <Route path="/" element={!isAuthenticated ? <LandingPage /> : (
          <Suspense fallback={<LoadingFallback />}>
            <MainApp />
          </Suspense>
        )} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/welcome" element={
            <Suspense fallback={<LoadingFallback />}>
              <MainApp />
            </Suspense>
          } />
          <Route path="/create-ai-project" element={
            <Suspense fallback={<LoadingFallback />}>
              <CreateAIProjectPage />
            </Suspense>
          } />
          <Route path="/server" element={
            <Suspense fallback={<LoadingFallback />}>
              <ServerPage />
            </Suspense>
          } />
          <Route path="/reset-app" element={
            <Suspense fallback={<LoadingFallback />}>
              <ResetAppPage />
            </Suspense>
          } />
          <Route path="*" element={
            <Suspense fallback={<LoadingFallback />}>
              <MainApp />
            </Suspense>
          } />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
// Force Rebuild
