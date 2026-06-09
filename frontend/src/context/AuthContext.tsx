import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, tryRefreshToken } from '../api/client'

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role?: 'USER' | 'ADMIN'
  subscription?: 'FREE' | 'PLUS' | 'PREMIUM'
  subscriptionUntil?: string | null
  isBlocked?: boolean
  entrepreneurProfile?: {
    type: string
    industryKnowledge?: string
  }
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    const rt = localStorage.getItem('refreshToken')

    if (!token && !rt) {
      setLoading(false)
      return
    }

    // client.ts автоматически делает refresh при 401 и повторяет запрос.
    // Поэтому просто вызываем /auth/me — всё остальное обработает client.
    api.get<User>('/auth/me')
      .then(setUser)
      .catch((err: any) => {
        const status = err?.status
        // Только явный 401/403 от сервера (не сетевая ошибка) — чистим сессию
        if (status === 401 || status === 403) {
          localStorage.clear()
        }
        // Сетевая ошибка (503) — не чистим, пользователь остаётся залогиненным
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', { email, password })
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    setUser(data.user)
  }

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/register', { email, password, firstName, lastName })
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    setUser(data.user)
  }

  const logout = () => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }).catch(() => {})
    }
    localStorage.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
