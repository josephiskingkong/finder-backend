import { NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { MessageSquare, TrendingUp, Map, Users, LogOut, Menu, X, Search, Shield, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import './Layout.css'

interface BusinessItem {
  id: string
  title: string
}

interface Conversation {
  id: string
  title?: string
  createdAt: string
}

// Транслитерация: русская раскладка ↔ английская
const RU_TO_EN: Record<string, string> = {
  'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p',
  'х': '[', 'ъ': ']', 'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k',
  'д': 'l', 'ж': ';', 'э': "'", 'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm',
  'б': ',', 'ю': '.', 'ё': '`',
  'Й': 'Q', 'Ц': 'W', 'У': 'E', 'К': 'R', 'Е': 'T', 'Н': 'Y', 'Г': 'U', 'Ш': 'I', 'Щ': 'O', 'З': 'P',
  'Х': '{', 'Ъ': '}', 'Ф': 'A', 'Ы': 'S', 'В': 'D', 'А': 'F', 'П': 'G', 'Р': 'H', 'О': 'J', 'Л': 'K',
  'Д': 'L', 'Ж': ':', 'Э': '"', 'Я': 'Z', 'Ч': 'X', 'С': 'C', 'М': 'V', 'И': 'B', 'Т': 'N', 'Ь': 'M',
  'Б': '<', 'Ю': '>', 'Ё': '~'
}

const EN_TO_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_TO_EN).map(([k, v]) => [v, k])
)

// Транслитерация строки в обе стороны
function transliterate(text: string): string[] {
  const lower = text.toLowerCase()
  // Вариант 1: рус → англ
  const ruToEn = lower.split('').map(c => RU_TO_EN[c] || c).join('')
  // Вариант 2: англ → рус
  const enToRu = lower.split('').map(c => EN_TO_RU[c] || c).join('')
  return [lower, ruToEn, enToRu]
}

// Упрощённое расстояние Левенштейна
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
    }
  }
  return matrix[b.length][a.length]
}

// Умный поиск: ищет с учётом транслитерации и опечаток
function smartSearch(query: string, text: string): boolean {
  if (!query) return true
  const queryVariants = transliterate(query)
  const textVariants = transliterate(text)

  for (const q of queryVariants) {
    for (const t of textVariants) {
      // Прямое вхождение
      if (t.includes(q)) return true
      // Расстояние Левенштейна ≤ 2 (опечатка)
      if (q.length > 3 && levenshtein(q, t.slice(0, q.length + 2)) <= 2) return true
    }
  }
  return false
}

const sections = [
  { to: '/chat', icon: <MessageSquare size={16} />, label: 'Чат-бот', color: '#3b5efe' },
  { to: '/market', icon: <TrendingUp size={16} />, label: 'Рынок', color: '#f5a623' },
  { to: '/roadmap', icon: <Map size={16} />, label: 'Роадмап', color: '#22c55e' },
  { to: '/interview', icon: <Users size={16} />, label: 'Интервью', color: '#a855f7' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''
  const activeConversationId = searchParams.get('conversationId') || ''
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [businesses, setBusinesses] = useState<BusinessItem[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentProject, setCurrentProject] = useState<BusinessItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    api.get<BusinessItem[]>('/businesses').then(setBusinesses).catch(() => {})
  }, [])

  useEffect(() => {
    if (businessId) {
      const proj = businesses.find(b => b.id === businessId)
      setCurrentProject(proj || null)
      api.get<Conversation[]>(`/chat/business/${businessId}/conversations`)
        .then(setConversations)
        .catch(() => {})
    } else {
      setCurrentProject(null)
      setConversations([])
    }
  }, [businessId, businesses])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const goToProjects = () => {
    navigate('/dashboard')
  }

  const createNewChat = async () => {
    if (!businessId) return
    try {
      const conv = await api.post<{ id: string }>('/chat/conversations', { businessId, title: 'Новый чат' })
      navigate(`/chat?businessId=${businessId}&conversationId=${conv.id}`)
      // Обновляем список чатов
      api.get<Conversation[]>(`/chat/business/${businessId}/conversations`)
        .then(setConversations)
        .catch(() => {})
    } catch {
      // fallback: просто открываем чат без conversationId
      navigate(`/chat?businessId=${businessId}`)
    }
  }

  const selectChat = (convId: string) => {
    if (!businessId) return
    navigate(`/chat?businessId=${businessId}&conversationId=${convId}`)
  }

  const handleDeleteChat = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/chat/conversations/${deleteTarget.id}`)
      setConversations(prev => prev.filter(c => c.id !== deleteTarget.id))
      // Если удалили активный чат — переходим на первый оставшийся или создаём новый
      if (deleteTarget.id === activeConversationId && businessId) {
        const remaining = conversations.filter(c => c.id !== deleteTarget.id)
        if (remaining.length > 0) {
          navigate(`/chat?businessId=${businessId}&conversationId=${remaining[0].id}`)
        } else {
          navigate(`/chat?businessId=${businessId}`)
        }
      }
    } finally {
      setDeleteTarget(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="layout">
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
        <Menu size={22} />
      </button>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          {/* User info */}
          <div className="sidebar-user">
            <div className="user-avatar">{user?.firstName?.[0] || user?.email?.[0] || '?'}</div>
            <div className="user-details">
              <span className="user-name">{user?.firstName || user?.email}</span>
              <button
                type="button"
                className={`user-badge plan-${(user?.subscription || 'FREE').toLowerCase()}`}
                onClick={() => navigate('/pricing')}
                title="Тарифы и сравнение планов"
              >
                {(user?.subscription || 'FREE') === 'FREE' && 'free'}
                {user?.subscription === 'PLUS' && 'plus'}
                {user?.subscription === 'PREMIUM' && 'premium'}
              </button>
            </div>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
              <X size={20} />
            </button>
          </div>

          {/* Nav sections */}
          <nav className="nav">
            {sections.map(s => (
              <NavLink
                key={s.to}
                to={businessId ? `${s.to}?businessId=${businessId}` : s.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-dot" style={{ background: s.color }} />
                <span>{s.label}</span>
              </NavLink>
            ))}
            {user?.role === 'ADMIN' && (
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-dot" style={{ background: '#ef4444' }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Shield size={13} /> Админка
                </span>
              </NavLink>
            )}
          </nav>


          {/* Conversations list when in a project, otherwise Projects list */}
          <div className="sidebar-projects">
            {businessId ? (
              <>
                <div className="projects-header-with-back">
                  <button className="back-icon-btn" onClick={goToProjects} title="К проектам">
                    <ArrowLeft size={16} />
                  </button>
                  <span className="projects-header-title">{currentProject?.title || 'Чаты'}</span>
                  <button className="new-chat-btn" onClick={createNewChat} title="Новый чат">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="projects-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Поиск чатов"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="projects-list">
                  {conversations.length === 0 ? (
                    <div className="empty-chats">Нет чатов. Создайте первый!</div>
                  ) : (
                    conversations
                      .filter(c => smartSearch(searchQuery, c.title || 'Новый чат'))
                      .map(c => (
                        <button
                          key={c.id}
                          className={`project-item chat-item ${c.id === activeConversationId ? 'active' : ''}`}
                          onClick={() => selectChat(c.id)}
                        >
                          <MessageSquare size={14} />
                          <span className="chat-title">{c.title || 'Новый чат'}</span>
                          <span className="chat-date">{formatDate(c.createdAt)}</span>
                          <span
                            className="chat-delete-btn"
                            onClick={e => {
                              e.stopPropagation()
                              setDeleteTarget(c)
                            }}
                            title="Удалить чат"
                          >
                            <Trash2 size={12} />
                          </span>
                        </button>
                      ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="projects-label simple">
                  <span>Проекты</span>
                </div>
                <div className="projects-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Поиск проектов"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="projects-list">
                  {businesses
                    .filter(b => smartSearch(searchQuery, b.title))
                    .map(b => (
                      <button
                        key={b.id}
                        className={`project-item ${b.id === businessId ? 'active' : ''}`}
                        onClick={() => navigate(`/chat?businessId=${b.id}`)}
                      >
                        {b.title}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="sidebar-bottom">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="delete-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="delete-modal" onClick={e => e.stopPropagation()}>
            <h3 className="delete-modal-title">Удалить чат?</h3>
            <p className="delete-modal-text">
              «{deleteTarget.title || 'Новый чат'}» будет удалён безвозвратно.
            </p>
            <div className="delete-modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button className="btn btn-danger" onClick={handleDeleteChat}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
