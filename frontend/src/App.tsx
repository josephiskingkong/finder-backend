import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import RoadmapPage from './pages/Roadmap'
import MarketPage from './pages/Market'
import InterviewPage from './pages/Interview'
import Admin from './pages/Admin'
import Pricing from './pages/Pricing'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Публичные */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Защищённые */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/roadmap" element={<RoadmapPage />} />
              <Route path="/market" element={<MarketPage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/pricing" element={<Pricing />} />
              {/* /admin доступен только для USER.role === 'ADMIN', остальные → /dashboard */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Route>
          </Route>

          {/* Редирект по умолчанию */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
