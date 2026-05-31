import { useEffect, useState, useCallback, FormEvent } from 'react'
import { Shield, Search, RefreshCw, Lock, Unlock, Trash2, CheckCircle2 } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import './Admin.css'

type Plan = 'FREE' | 'PLUS' | 'PREMIUM'
type Role = 'USER' | 'ADMIN'

interface AdminUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: Role
  subscription: Plan
  subscriptionUntil: string | null
  isBlocked: boolean
  createdAt: string
  _count?: { businesses?: number }
}

interface ListResult {
  total: number
  page: number
  pageSize: number
  items: AdminUser[]
}

interface Stats {
  users: { total: number; blocked: number; admins: number }
  subscriptions: Record<Plan, number>
  businesses: number
  conversations: number
}

interface PlanConfig {
  plan: Plan
  messagesPerWindow: number
  windowHours: number
  label: string
  description: string | null
  updatedAt: string | null
  isDefault?: boolean
}

const PLAN_BADGE: Record<Plan, { label: string; color: string }> = {
  FREE: { label: 'Free', color: '#9ca3af' },
  PLUS: { label: 'Plus', color: '#3b5efe' },
  PREMIUM: { label: 'Premium', color: '#a855f7' },
}

export default function Admin() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [list, setList] = useState<ListResult | null>(null)
  const [plans, setPlans] = useState<PlanConfig[]>([])
  const [planEdits, setPlanEdits] = useState<Record<Plan, { messagesPerWindow: string; windowHours: string }>>({
    FREE: { messagesPerWindow: '', windowHours: '' },
    PLUS: { messagesPerWindow: '', windowHours: '' },
    PREMIUM: { messagesPerWindow: '', windowHours: '' },
  })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<Plan | ''>('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadStats = useCallback(() => {
    api.get<Stats>('/admin/stats').then(setStats).catch(() => {})
  }, [])

  const loadPlans = useCallback(() => {
    api.get<PlanConfig[]>('/admin/plans')
      .then(rows => {
        setPlans(rows)
        const edits = { FREE: { messagesPerWindow: '', windowHours: '' }, PLUS: { messagesPerWindow: '', windowHours: '' }, PREMIUM: { messagesPerWindow: '', windowHours: '' } } as Record<Plan, { messagesPerWindow: string; windowHours: string }>
        rows.forEach(p => {
          edits[p.plan] = { messagesPerWindow: String(p.messagesPerWindow), windowHours: String(p.windowHours) }
        })
        setPlanEdits(edits)
      })
      .catch(() => {})
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (planFilter) params.set('plan', planFilter)
      if (roleFilter) params.set('role', roleFilter)
      params.set('page', String(page))
      params.set('pageSize', '20')
      const res = await api.get<ListResult>(`/admin/users?${params.toString()}`)
      setList(res)
    } catch (e: any) {
      setError(e.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [search, planFilter, roleFilter, page])

  useEffect(() => {
    loadStats()
    loadPlans()
  }, [loadStats, loadPlans])

  useEffect(() => {
    loadList()
  }, [loadList])

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  const updateSubscription = async (id: string, plan: Plan, until: string | null) => {
    try {
      await api.patch(`/admin/users/${id}/subscription`, {
        plan,
        until: plan === 'FREE' ? null : until,
      })
      flash('Подписка обновлена')
      await loadList()
      await loadStats()
      setEditing(null)
    } catch (e: any) {
      setError(e.message || 'Не удалось обновить подписку')
    }
  }

  const updateRole = async (id: string, role: Role) => {
    try {
      await api.patch(`/admin/users/${id}/role`, { role })
      flash('Роль обновлена')
      await loadList()
      await loadStats()
    } catch (e: any) {
      setError(e.message || 'Не удалось обновить роль')
    }
  }

  const toggleBlocked = async (u: AdminUser) => {
    try {
      await api.patch(`/admin/users/${u.id}/blocked`, { blocked: !u.isBlocked })
      flash(!u.isBlocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован')
      await loadList()
      await loadStats()
    } catch (e: any) {
      setError(e.message || 'Не удалось изменить статус')
    }
  }

  const savePlan = async (plan: Plan) => {
    const edit = planEdits[plan]
    const messagesPerWindow = parseInt(edit.messagesPerWindow, 10)
    const windowHours = parseInt(edit.windowHours, 10)
    if (!Number.isInteger(messagesPerWindow) || messagesPerWindow < 1) {
      setError('Лимит должен быть целым положительным числом')
      return
    }
    if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) {
      setError('Окно в часах должно быть от 1 до 168')
      return
    }
    try {
      await api.patch(`/admin/plans/${plan}`, { messagesPerWindow, windowHours })
      flash(`Лимиты ${plan} обновлены`)
      await loadPlans()
    } catch (e: any) {
      setError(e.message || 'Не удалось сохранить лимиты')
    }
  }

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Удалить ${u.email}? Это действие необратимо.`)) return
    try {
      await api.delete(`/admin/users/${u.id}`)
      flash('Пользователь удалён')
      await loadList()
      await loadStats()
    } catch (e: any) {
      setError(e.message || 'Не удалось удалить')
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1><Shield size={22} /> Админка</h1>
          <p className="admin-sub">Управление пользователями, подписками и ролями</p>
        </div>
        <button className="btn-icon" onClick={() => { loadStats(); loadList() }} title="Обновить">
          <RefreshCw size={16} />
        </button>
      </header>

      {error && <div className="admin-alert error">{error}</div>}
      {notice && <div className="admin-alert success"><CheckCircle2 size={14} /> {notice}</div>}

      {stats && (
        <div className="stats-grid">
          <Stat label="Всего пользователей" value={stats.users.total} />
          <Stat label="Админов" value={stats.users.admins} />
          <Stat label="Заблокированных" value={stats.users.blocked} />
          <Stat label="Бизнес-проектов" value={stats.businesses} />
          <Stat label="Бесед в чате" value={stats.conversations} />
          <Stat label="Free / Plus / Premium" value={`${stats.subscriptions.FREE} / ${stats.subscriptions.PLUS} / ${stats.subscriptions.PREMIUM}`} />
        </div>
      )}

      {plans.length > 0 && (
        <section className="plans-section">
          <div className="plans-header">
            <h2>Тарифы и лимиты</h2>
            <p className="muted">
              Изменения применяются ко всем пользователям в течение ~1 минуты (кэш на сервере).
              Иерархия FREE ≤ PLUS ≤ PREMIUM обязательна.
            </p>
          </div>
          <div className="plans-grid">
            {plans.map(p => {
              const dirty =
                planEdits[p.plan].messagesPerWindow !== String(p.messagesPerWindow) ||
                planEdits[p.plan].windowHours !== String(p.windowHours)
              const perDay = Math.round((parseInt(planEdits[p.plan].messagesPerWindow, 10) || 0) * (24 / (parseInt(planEdits[p.plan].windowHours, 10) || 1)))
              return (
                <div key={p.plan} className="plan-card">
                  <div className="plan-card-head">
                    <span className="plan-badge" style={{ background: PLAN_BADGE[p.plan].color }}>{p.label}</span>
                    {p.isDefault && <span className="plan-pill">по умолчанию</span>}
                  </div>
                  {p.description && <p className="plan-desc">{p.description}</p>}
                  <div className="plan-fields">
                    <label>
                      <span>Сообщений в окне</span>
                      <input
                        type="number"
                        min={1}
                        value={planEdits[p.plan].messagesPerWindow}
                        onChange={e => setPlanEdits(prev => ({ ...prev, [p.plan]: { ...prev[p.plan], messagesPerWindow: e.target.value } }))}
                      />
                    </label>
                    <label>
                      <span>Окно (часов)</span>
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={planEdits[p.plan].windowHours}
                        onChange={e => setPlanEdits(prev => ({ ...prev, [p.plan]: { ...prev[p.plan], windowHours: e.target.value } }))}
                      />
                    </label>
                  </div>
                  <div className="plan-hint">
                    Эффективно ≈ <strong>{Number.isFinite(perDay) ? perDay : 0}</strong> сообщений/день
                  </div>
                  <button
                    className="btn-sm plan-save"
                    disabled={!dirty}
                    onClick={() => savePlan(p.plan)}
                  >
                    {dirty ? 'Сохранить' : 'Без изменений'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="admin-filters">
        <div className="filter-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Поиск по email / имени"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select value={planFilter} onChange={e => { setPlanFilter(e.target.value as Plan | ''); setPage(1) }}>
          <option value="">Все подписки</option>
          <option value="FREE">Free</option>
          <option value="PLUS">Plus</option>
          <option value="PREMIUM">Premium</option>
        </select>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value as Role | ''); setPage(1) }}>
          <option value="">Все роли</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Имя</th>
              <th>Роль</th>
              <th>Подписка</th>
              <th>До</th>
              <th>Бизнесов</th>
              <th>Создан</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="td-center">Загрузка...</td></tr>
            )}
            {!loading && list?.items.length === 0 && (
              <tr><td colSpan={8} className="td-center muted">Никого не найдено</td></tr>
            )}
            {!loading && list?.items.map(u => (
              <tr key={u.id} className={u.isBlocked ? 'blocked' : ''}>
                <td>
                  <div className="user-email">{u.email}</div>
                  {u.id === user?.id && <span className="self-pill">это вы</span>}
                </td>
                <td>{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={u.id === user?.id}
                    onChange={e => updateRole(u.id, e.target.value as Role)}
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td>
                  <span className="plan-badge" style={{ background: PLAN_BADGE[u.subscription].color }}>
                    {PLAN_BADGE[u.subscription].label}
                  </span>
                </td>
                <td>{u.subscriptionUntil ? new Date(u.subscriptionUntil).toLocaleDateString() : '—'}</td>
                <td className="td-center">{u._count?.businesses ?? 0}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="actions">
                  <button className="btn-sm" onClick={() => setEditing(u)}>Тариф</button>
                  <button
                    className={`btn-sm ${u.isBlocked ? 'unblock' : 'block'}`}
                    onClick={() => toggleBlocked(u)}
                    disabled={u.id === user?.id}
                    title={u.isBlocked ? 'Разблокировать' : 'Заблокировать'}
                  >
                    {u.isBlocked ? <Unlock size={14} /> : <Lock size={14} />}
                  </button>
                  <button
                    className="btn-sm danger"
                    onClick={() => deleteUser(u)}
                    disabled={u.id === user?.id}
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {list && list.total > list.pageSize && (
        <div className="admin-pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</button>
          <span>Стр. {page} из {Math.ceil(list.total / list.pageSize)}</span>
          <button disabled={page * list.pageSize >= list.total} onClick={() => setPage(p => p + 1)}>Вперёд</button>
        </div>
      )}

      {editing && (
        <SubscriptionModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={(plan, until) => updateSubscription(editing.id, plan, until)}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function SubscriptionModal({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser
  onClose: () => void
  onSave: (plan: Plan, until: string | null) => void
}) {
  const [plan, setPlan] = useState<Plan>(user.subscription)
  const [days, setDays] = useState<number>(30)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    let until: string | null = null
    if (plan !== 'FREE') {
      until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    }
    onSave(plan, until)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Тариф · {user.email}</h2>
        <form onSubmit={submit} className="modal-form">
          <label>
            <span>План</span>
            <select value={plan} onChange={e => setPlan(e.target.value as Plan)}>
              <option value="FREE">Free — без ИИ-моделей</option>
              <option value="PLUS">Plus — GigaChat</option>
              <option value="PREMIUM">Premium — все модели</option>
            </select>
          </label>
          {plan !== 'FREE' && (
            <label>
              <span>Срок (дней)</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={e => setDays(parseInt(e.target.value) || 30)}
              />
              <small>До {new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString()}</small>
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  )
}
