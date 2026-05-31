import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Гард для админских роутов: пускает только USER.role === 'ADMIN'.
 * Не-админа отправляет на дашборд, чтобы исключить «пустую» страницу
 * и любые подсказки о существовании админки.
 */
export default function AdminRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />
  return <Outlet />
}
