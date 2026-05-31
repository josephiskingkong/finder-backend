import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, Plus, Trash2, Check, X, HelpCircle, User, Sparkles, Target, DollarSign, Users, Lightbulb, Zap } from 'lucide-react'
import { api } from '../api/client'
import './Interview.css'

const BASE = ''

type HypothesisStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'PARTIALLY'
type HypothesisCategory = 'problem' | 'solution' | 'value' | 'price' | 'channel' | 'other'

interface InterviewQuestion {
  id: string
  question: string
  questionType: 'open' | 'yes_no' | 'scale'
  isAiGenerated: boolean
  order: number
}

interface InterviewFinding {
  id: string
  interviewee: string
  notes: string | null
  verdict: 'confirmed' | 'rejected' | 'unclear'
  createdAt: string
}

interface Hypothesis {
  id: string
  statement: string
  category: HypothesisCategory
  status: HypothesisStatus
  priority: number
  isAiGenerated: boolean
  confirmedCount: number
  rejectedCount: number
  evidenceSummary: string | null
  questions: InterviewQuestion[]
  findings: InterviewFinding[]
  createdAt: string
}


const categoryIcons: Record<HypothesisCategory, React.ReactNode> = {
  problem: <Target size={14} />,
  solution: <Lightbulb size={14} />,
  value: <Sparkles size={14} />,
  price: <DollarSign size={14} />,
  channel: <Users size={14} />,
  other: <HelpCircle size={14} />,
}

const categoryLabels: Record<HypothesisCategory, string> = {
  problem: 'Проблема',
  solution: 'Решение',
  value: 'Ценность',
  price: 'Цена',
  channel: 'Канал',
  other: 'Другое',
}

const statusLabels: Record<HypothesisStatus, string> = {
  PENDING: 'Ожидает',
  CONFIRMED: 'Подтверждена',
  REJECTED: 'Опровергнута',
  PARTIALLY: 'Частично',
}

const statusColors: Record<HypothesisStatus, string> = {
  PENDING: '#f5a623',
  CONFIRMED: '#22c55e',
  REJECTED: '#ef4444',
  PARTIALLY: '#8b5cf6',
}

export default function InterviewPage() {
  const [searchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Form states
  const [newStatement, setNewStatement] = useState('')
  const [newCategory, setNewCategory] = useState<HypothesisCategory>('problem')
  const [newPriority, setNewPriority] = useState(3)
  const [newQuestion, setNewQuestion] = useState('')

  // Finding form
  const [findingInterviewee, setFindingInterviewee] = useState('')
  const [findingNotes, setFindingNotes] = useState('')
  const [findingVerdict, setFindingVerdict] = useState<'confirmed' | 'rejected' | 'unclear'>('confirmed')

  const token = localStorage.getItem('accessToken')

  useEffect(() => {
    if (businessId) {
      loadHypotheses()
    }
  }, [businessId])

  async function loadHypotheses() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/api/interview/business/${businessId}/hypotheses`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      // 404 или пустой результат - это нормально, просто нет гипотез yet
      if (res.status === 404) {
        setHypotheses([])
        return
      }
      if (!res.ok) {
        console.error('Interview API error:', res.status, await res.text())
        setHypotheses([])
        return
      }
      const json = await res.json()
      const data = json.data ?? json
      setHypotheses(data.hypotheses || [])
    } catch (e) {
      console.error('Failed to load hypotheses:', e)
      setHypotheses([])
    } finally {
      setLoading(false)
    }
  }

  async function generateHypotheses() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/api/interview/hypotheses/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ businessId, count: 10 }),
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('Generate error:', res.status, errorText)
        throw new Error(`Failed to generate: ${res.status}`)
      }
      await loadHypotheses()
    } catch (e) {
      console.error('Generate hypotheses error:', e)
      setError('Не удалось сгенерировать гипотезы. Проверьте консоль (F12) для деталей.')
    } finally {
      setGenerating(false)
    }
  }

  async function createHypothesis(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch(`${BASE}/api/interview/hypotheses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessId,
          statement: newStatement,
          category: newCategory,
          priority: newPriority,
        }),
      })
      if (!res.ok) throw new Error('Failed to create')
      const created = await res.json()

      // Add question if provided
      if (newQuestion.trim()) {
        await fetch(`${BASE}/api/interview/hypotheses/${created.id}/questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            question: newQuestion,
            questionType: 'open',
            order: 0,
          }),
        })
      }

      setNewStatement('')
      setNewQuestion('')
      setShowCreateForm(false)
      await loadHypotheses()
    } catch (e) {
      setError('Не удалось создать гипотезу')
    }
  }

  async function deleteHypothesis(id: string) {
    if (!confirm('Удалить гипотезу?')) return
    try {
      const res = await fetch(`${BASE}/api/interview/hypotheses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to delete')
      await loadHypotheses()
    } catch (e) {
      setError('Не удалось удалить гипотезу')
    }
  }

  async function addQuestion(hypothesisId: string, question: string) {
    try {
      const res = await fetch(`${BASE}/api/interview/hypotheses/${hypothesisId}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          questionType: 'open',
          order: 0,
        }),
      })
      if (!res.ok) throw new Error('Failed to add question')
      await loadHypotheses()
    } catch (e) {
      setError('Не удалось добавить вопрос')
    }
  }

  async function deleteQuestion(questionId: string) {
    try {
      const res = await fetch(`${BASE}/api/interview/questions/${questionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to delete question')
      await loadHypotheses()
    } catch (e) {
      setError('Не удалось удалить вопрос')
    }
  }

  async function recordFinding(hypothesisId: string) {
    try {
      const res = await fetch(`${BASE}/api/interview/hypotheses/${hypothesisId}/findings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          interviewee: findingInterviewee,
          notes: findingNotes,
          verdict: findingVerdict,
        }),
      })
      if (!res.ok) throw new Error('Failed to record')
      setFindingInterviewee('')
      setFindingNotes('')
      await loadHypotheses()
    } catch (e) {
      setError('Не удалось записать результат')
    }
  }

  if (!businessId) {
    return (
      <div className="interview-page">
        <div className="interview-empty">
          <Users size={40} strokeWidth={1.2} />
          <h2>Выберите проект</h2>
          <p>Выберите бизнес-проект в боковой панели, чтобы работать с гипотезами и интервью</p>
        </div>
      </div>
    )
  }

  return (
    <div className="interview-page">
      <div className="interview-header">
        <div className="interview-title-wrap">
          <div className="interview-icon-wrap">
            <Users size={24} />
          </div>
          <div>
            <h1 className="interview-title">Интервью и гипотезы</h1>
            <p className="interview-subtitle">
              Сформулируйте гипотезы и проверьте их через интервью с потенциальными клиентами
            </p>
          </div>
        </div>
        <div className="interview-actions">
          <button
            className="interview-btn-generate"
            onClick={generateHypotheses}
            disabled={generating}
          >
            <Sparkles size={16} />
            {generating ? 'Генерация...' : 'Сгенерировать ИИ'}
          </button>
          <button
            className="interview-btn-create"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus size={16} />
            Добавить гипотезу
          </button>
        </div>
      </div>

      {showCreateForm && (
        <form className="interview-form" onSubmit={createHypothesis}>
          <h3>Новая гипотеза</h3>
          <textarea
            placeholder="Формулировка гипотезы (например: Пользователи готовы платить 500₽ за доставку за 1 час)"
            value={newStatement}
            onChange={(e) => setNewStatement(e.target.value)}
            required
          />
          <div className="form-row">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as HypothesisCategory)}
            >
              <option value="problem">Проблема</option>
              <option value="solution">Решение</option>
              <option value="value">Ценность</option>
              <option value="price">Цена</option>
              <option value="channel">Канал</option>
              <option value="other">Другое</option>
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
            >
              <option value={1}>Приоритет 1 (Критично)</option>
              <option value={2}>Приоритет 2</option>
              <option value={3}>Приоритет 3</option>
              <option value={4}>Приоритет 4</option>
              <option value={5}>Приоритет 5</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Вопрос для проверки (опционально)"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
          />
          <div className="form-actions">
            <button type="submit" className="btn-primary">Создать</button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreateForm(false)}>Отмена</button>
          </div>
        </form>
      )}

      {error && <div className="interview-error">{error}</div>}

      {loading ? (
        <div className="interview-loading">Загрузка...</div>
      ) : hypotheses.length === 0 ? (
        <div className="interview-empty-state">
          <p>Нет гипотез. Сгенерируйте их с помощью ИИ или добавьте вручную.</p>
        </div>
      ) : (
        <div className="hypothesis-list">
          {hypotheses.map((h) => (
            <div
              key={h.id}
              className={`hypothesis-card ${h.status.toLowerCase()}`}
              onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
            >
              <div className="hypothesis-header">
                <div className="hypothesis-meta">
                  <span className="hypothesis-category">
                    {categoryIcons[h.category]}
                    {categoryLabels[h.category]}
                  </span>
                  <span
                    className="hypothesis-status"
                    style={{ color: statusColors[h.status] }}
                  >
                    {statusLabels[h.status]}
                  </span>
                  {h.isAiGenerated && (
                    <span className="hypothesis-ai-badge">
                      <Sparkles size={12} /> AI
                    </span>
                  )}
                </div>
                <div className="hypothesis-counters">
                  <span className="counter confirmed" title="Подтверждено">
                    <Check size={12} /> {h.confirmedCount}
                  </span>
                  <span className="counter rejected" title="Отвергнуто">
                    <X size={12} /> {h.rejectedCount}
                  </span>
                  <span className="priority" title="Приоритет">P{h.priority}</span>
                  <button
                    className="btn-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteHypothesis(h.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="hypothesis-statement">{h.statement}</p>
              {h.evidenceSummary && (
                <p className="hypothesis-evidence">{h.evidenceSummary}</p>
              )}

              {expandedId === h.id && (
                <div className="hypothesis-details" onClick={(e) => e.stopPropagation()}>
                  <div className="detail-section">
                    <h4>Вопросы для интервью</h4>
                    <ul className="question-list">
                      {h.questions.map((q) => (
                        <li key={q.id} className="question-item">
                          <span>{q.question}</span>
                          <button
                            className="btn-icon"
                            onClick={() => deleteQuestion(q.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const input = e.currentTarget.elements.namedItem('question') as HTMLInputElement
                        if (input.value.trim()) {
                          addQuestion(h.id, input.value.trim())
                          input.value = ''
                        }
                      }}
                    >
                      <input
                        name="question"
                        type="text"
                        placeholder="Добавить вопрос..."
                        className="add-question-input"
                      />
                      <button type="submit" className="btn-small">
                        <Plus size={14} />
                      </button>
                    </form>
                  </div>

                  <div className="detail-section">
                    <h4>Результаты интервью</h4>
                    {h.findings.length > 0 ? (
                      <ul className="finding-list">
                        {h.findings.map((f) => (
                          <li key={f.id} className={`finding-item ${f.verdict}`}>
                            <div className="finding-header">
                              <User size={14} />
                              <span className="finding-name">{f.interviewee}</span>
                              <span className={`finding-verdict ${f.verdict}`}>
                                {f.verdict === 'confirmed' ? 'Подтвердил' : f.verdict === 'rejected' ? 'Опроверг' : 'Не ясно'}
                              </span>
                            </div>
                            {f.notes && <p className="finding-notes">{f.notes}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="no-findings">Пока нет результатов</p>
                    )}

                    <div className="add-finding-form">
                      <h5>Добавить результат интервью</h5>
                      <input
                        type="text"
                        placeholder="Имя респондента"
                        value={findingInterviewee}
                        onChange={(e) => setFindingInterviewee(e.target.value)}
                      />
                      <textarea
                        placeholder="Заметки из интервью"
                        value={findingNotes}
                        onChange={(e) => setFindingNotes(e.target.value)}
                      />
                      <div className="verdict-buttons">
                        <button
                          type="button"
                          className={`verdict-btn ${findingVerdict === 'confirmed' ? 'active' : ''}`}
                          onClick={() => setFindingVerdict('confirmed')}
                        >
                          <Check size={14} /> Подтвердил
                        </button>
                        <button
                          type="button"
                          className={`verdict-btn ${findingVerdict === 'rejected' ? 'active' : ''}`}
                          onClick={() => setFindingVerdict('rejected')}
                        >
                          <X size={14} /> Опроверг
                        </button>
                        <button
                          type="button"
                          className={`verdict-btn ${findingVerdict === 'unclear' ? 'active' : ''}`}
                          onClick={() => setFindingVerdict('unclear')}
                        >
                          <HelpCircle size={14} /> Не ясно
                        </button>
                      </div>
                      <button
                        className="btn-primary"
                        onClick={() => recordFinding(h.id)}
                        disabled={!findingInterviewee}
                      >
                        Записать результат
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="interview-hint">
        <MessageSquare size={16} />
        <span>Совет: Проведите минимум 5 интервью для каждой критичной гипотезы. Используйте открытые вопросы о прошлом опыте, а не «вы бы купили...»</span>
      </div>
    </div>
  )
}
