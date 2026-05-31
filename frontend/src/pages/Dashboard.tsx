import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Plus, ArrowRight, Briefcase, MessageSquare, Map, Sparkles, Trash2, AlertTriangle, X } from 'lucide-react'
import './Dashboard.css'

interface Business {
  id: string
  title: string
  description?: string
  industry?: string
  problemStatement?: string
  targetAudience?: string
  uniqueValue?: string
  competitors?: string
  monetizationModel?: string
  status: string
  createdAt: string
  roadmap?: { steps: { status: string }[] }
}

const statusLabels: Record<string, string> = {
  IDEA_GENERATION: 'Генерация идеи',
  IDEA_DEFINED: 'Идея определена',
  ANALYSIS: 'Анализ',
  VALIDATION: 'Проверка гипотез',
  MVP: 'MVP',
  ITERATION: 'Итерация',
  LAUNCHED: 'Запущен',
}

export default function Dashboard() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [generateIdea, setGenerateIdea] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedBiz, setSelectedBiz] = useState<Business | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get<Business[]>('/businesses').then(setBusinesses).catch(() => {})
  }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/businesses/${deleteTarget.id}`)
      setBusinesses(prev => prev.filter(b => b.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {} finally {
      setDeleting(false)
    }
  }

  const handleCreate = async () => {
    if (!generateIdea && !title.trim()) return
    setCreating(true)
    try {
      const body: Record<string, string | undefined> = {
        title: generateIdea ? 'Новый проект' : title,
        description: generateIdea ? 'Помоги мне сгенерировать идею для бизнеса' : (description || undefined),
      }
      const biz = await api.post<Business>('/businesses', body)
      setBusinesses(prev => [biz, ...prev])
      setShowCreate(false)
      setTitle('')
      setDescription('')
      setGenerateIdea(false)
      navigate(`/chat?businessId=${biz.id}`)
    } catch {
    } finally {
      setCreating(false)
    }
  }

  const getProgress = (biz: Business) => {
    const steps = biz.roadmap?.steps || []
    if (steps.length === 0) return 0
    const done = steps.filter(s => s.status === 'COMPLETED').length
    return Math.round((done / steps.length) * 100)
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Мои проекты</h1>
          <p className="dashboard-subtitle">Управляйте своими бизнес-идеями</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Новый проект
        </button>
      </div>

      {showCreate && (
        <div className="create-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="create-modal" onClick={e => e.stopPropagation()}>
            <h2 className="create-modal-title">Новый проект</h2>

            <div className="create-mode-toggle">
              <button
                className={`mode-btn ${!generateIdea ? 'active' : ''}`}
                onClick={() => setGenerateIdea(false)}
              >
                Своя идея
              </button>
              <button
                className={`mode-btn ${generateIdea ? 'active' : ''}`}
                onClick={() => setGenerateIdea(true)}
              >
                <Sparkles size={14} />
                Сгенерировать идею
              </button>
            </div>

            {generateIdea ? (
              <p className="generate-hint">
                ИИ-наставник поможет вам найти подходящую бизнес-идею на основе ваших интересов и навыков
              </p>
            ) : (
              <>
                <div className="field">
                  <label className="label">Название</label>
                  <input
                    className="input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Например: Маркетплейс для фермеров"
                    autoFocus
                  />
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label className="label">Описание (необязательно)</label>
                  <textarea
                    className="input"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Кратко опишите идею..."
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </>
            )}

            <div className="create-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={(!generateIdea && !title.trim()) || creating}
              >
                {creating ? 'Создание...' : generateIdea ? 'Создать и найти идею' : 'Создать и начать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="empty-state">
          <Briefcase size={48} strokeWidth={1.2} />
          <h2>Пока нет проектов</h2>
          <p>Создайте первый бизнес-проект, чтобы начать работать с ИИ-наставником</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Создать проект
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {businesses.map(biz => (
            <div key={biz.id} className="project-card">
              <div className="project-card-body" onClick={() => navigate(`/project?businessId=${biz.id}`)}>
                <div className="project-card-header">
                  <h3 className="project-card-title">{biz.title}</h3>
                </div>
                {biz.description && (
                  <p className="project-card-desc">{biz.description}</p>
                )}
                <div className="project-card-footer">
                  <span className="project-status">{statusLabels[biz.status] || biz.status}</span>
                  {biz.roadmap && (
                    <div className="project-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${getProgress(biz)}%` }} />
                      </div>
                      <span className="progress-text">{getProgress(biz)}%</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="project-card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/chat?businessId=${biz.id}`)}>
                  <MessageSquare size={14} />
                  Чат
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/roadmap?businessId=${biz.id}`)}>
                  <Map size={14} />
                  Роадмап
                </button>
                <button className="btn btn-danger-outline btn-sm" onClick={() => setDeleteTarget({ id: biz.id, title: biz.title })}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="create-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="create-modal delete-modal" onClick={e => e.stopPropagation()}>
            <div className="delete-modal-icon">
              <AlertTriangle size={32} />
            </div>
            <h2 className="create-modal-title">Удалить проект?</h2>
            <p className="delete-modal-text">
              Проект «{deleteTarget.title}» и все данные (чаты, роадмап) будут удалены безвозвратно.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Отмена
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBiz && (
        <div className="create-modal-overlay" onClick={() => setSelectedBiz(null)}>
          <div className="create-modal detail-modal" onClick={e => e.stopPropagation()}>
            <div className="detail-modal-header">
              <h2 className="create-modal-title" style={{ marginBottom: 0 }}>{selectedBiz.title}</h2>
              <button className="btn-ghost" onClick={() => setSelectedBiz(null)}><X size={18} /></button>
            </div>
            <span className="project-status" style={{ alignSelf: 'flex-start' }}>{statusLabels[selectedBiz.status] || selectedBiz.status}</span>
            {selectedBiz.description && (
              <div className="detail-field">
                <span className="detail-label">Описание</span>
                <p className="detail-value">{selectedBiz.description}</p>
              </div>
            )}
            {selectedBiz.industry && (
              <div className="detail-field">
                <span className="detail-label">Отрасль</span>
                <p className="detail-value">{selectedBiz.industry}</p>
              </div>
            )}
            {selectedBiz.problemStatement && (
              <div className="detail-field">
                <span className="detail-label">Проблема</span>
                <p className="detail-value">{selectedBiz.problemStatement}</p>
              </div>
            )}
            {selectedBiz.targetAudience && (
              <div className="detail-field">
                <span className="detail-label">Целевая аудитория</span>
                <p className="detail-value">{selectedBiz.targetAudience}</p>
              </div>
            )}
            {selectedBiz.uniqueValue && (
              <div className="detail-field">
                <span className="detail-label">Уникальная ценность</span>
                <p className="detail-value">{selectedBiz.uniqueValue}</p>
              </div>
            )}
            {selectedBiz.competitors && (
              <div className="detail-field">
                <span className="detail-label">Конкуренты</span>
                <p className="detail-value">{selectedBiz.competitors}</p>
              </div>
            )}
            {selectedBiz.monetizationModel && (
              <div className="detail-field">
                <span className="detail-label">Модель монетизации</span>
                <p className="detail-value">{selectedBiz.monetizationModel}</p>
              </div>
            )}
            <div className="detail-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedBiz(null); navigate(`/chat?businessId=${selectedBiz.id}`) }}>
                <MessageSquare size={14} /> Чат
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedBiz(null); navigate(`/roadmap?businessId=${selectedBiz.id}`) }}>
                <Map size={14} /> Роадмап
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
