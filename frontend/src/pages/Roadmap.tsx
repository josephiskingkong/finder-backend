Напimport { ReactElement } from 'react'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import ReactMarkdown from 'react-markdown'
import {
  Lock, CircleDot, Play, CheckCircle2,
  AlertTriangle, Loader2, Send, ChevronDown, ChevronUp
} from 'lucide-react'
import './Roadmap.css'

interface BusinessItem {
  id: string
  title: string
}

interface RoadmapStep {
  id: string
  phase: string
  order: number
  title: string
  description: string
  tips?: string
  status: 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
  aiAnalysis?: string
  userReport?: string
}

interface Roadmap {
  id: string
  steps: RoadmapStep[]
}

const phaseLabels: Record<string, string> = {
  PROBLEMATIZATION: 'Проблематизация',
  PRODUCT_STUDY: 'Изучение продукта',
  MARKET_ANALYSIS: 'Анализ рынка',
  MONETIZATION: 'Монетизация',
  USER_INTERVIEWS: 'Интервью с пользователями',
  MVP_CREATION: 'Создание MVP',
  REPEAT_CUSTDEV: 'Повторный кастдев',
  REGISTRATION: 'Регистрация бизнеса',
  ACCOUNTING: 'Бухгалтерия',
}

const statusIcons: Record<string, ReactElement> = {
  LOCKED: <Lock size={18} />,
  AVAILABLE: <CircleDot size={18} />,
  IN_PROGRESS: <Play size={18} />,
  COMPLETED: <CheckCircle2 size={18} />,
  FAILED: <AlertTriangle size={18} />,
  SKIPPED: <CheckCircle2 size={18} />,
}

/** Превращает сплошной текст с «Шаг N:» / «N.» в Markdown с переносами */
function formatStepText(text: string): string {
  return text
    // "Шаг 1:" / "Шаг 2:" → на новую строку с жирным заголовком
    .replace(/(?<!\n)\s*Шаг\s+(\d+)\s*[:\.]\s*/gi, '\n\n**Шаг $1.** ')
    // "1. " / "2. " в начале или после точки/пробела → нумерованный список
    .replace(/(?<!\n)(?<=[\.\!\?])\s+(\d+)\.\s+/g, '\n\n$1. ')
    .trim()
}

export default function RoadmapPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''

  const [businesses, setBusinesses] = useState<BusinessItem[]>([])
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [reportText, setReportText] = useState('')
  const [reportSuccess, setReportSuccess] = useState(true)
  const [reporting, setReporting] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  const currentProject = businesses.find(b => b.id === businessId)

  useEffect(() => {
    api.get<BusinessItem[]>('/businesses').then(setBusinesses).catch(() => {})
  }, [])

  const selectProject = (id: string) => {
    setSearchParams({ businessId: id })
    setShowProjectPicker(false)
  }

  useEffect(() => {
    if (!businessId) return
    loadRoadmap()
  }, [businessId])

  const loadRoadmap = async () => {
    setLoading(true)
    try {
      const data = await api.get<Roadmap>(`/roadmap/business/${businessId}`)
      setRoadmap(data)
    } catch {
      setRoadmap(null)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!businessId) return
    setGenerating(true)
    try {
      const data = await api.post<Roadmap>(`/roadmap/generate`, { businessId })
      setRoadmap(data)
    } catch {
      // ошибка
    } finally {
      setGenerating(false)
    }
  }

  const handleStart = async (stepId: string) => {
    setStarting(stepId)
    try {
      await api.patch(`/roadmap/steps/${stepId}/start`)
      await loadRoadmap()
    } catch {
      // ошибка
    } finally {
      setStarting(null)
    }
  }

  const handleReport = async (stepId: string) => {
    if (!reportText.trim()) return
    setReporting(true)
    try {
      const res = await api.post<{ step: any; aiAnalysis: string; roadmap: any }>(`/roadmap/steps/${stepId}/report`, {
        report: reportText,
        success: reportSuccess,
      })
      setReportText('')
      if (res.roadmap) {
        setRoadmap(res.roadmap)
      } else {
        await loadRoadmap()
      }
      // авто-раскрываем шаг чтобы пользователь сразу увидел анализ ИИ
      setExpandedStep(stepId)
    } catch {
      // ошибка
    } finally {
      setReporting(false)
    }
  }

  const completedCount = roadmap?.steps.filter(s => s.status === 'COMPLETED').length || 0
  const totalCount = roadmap?.steps.length || 0
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  if (!businessId) {
    return (
      <div className="roadmap-page">
        <div className="roadmap-project-picker">
          <div className="project-picker-wrapper">
            <button className="project-picker-btn" onClick={() => setShowProjectPicker(p => !p)}>
              <span>Выберите проект</span>
              <ChevronDown size={14} />
            </button>
            {showProjectPicker && (
              <div className="project-picker-dropdown">
                {businesses.length === 0 ? (
                  <div className="picker-empty">Нет проектов</div>
                ) : (
                  businesses.map(b => (
                    <button
                      key={b.id}
                      className={`picker-item ${b.id === businessId ? 'active' : ''}`}
                      onClick={() => selectProject(b.id)}
                    >
                      {b.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="roadmap-empty">
          <h2>Выберите проект</h2>
          <p>Выберите бизнес-проект выше, чтобы увидеть дорожную карту</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="roadmap-empty">
        <Loader2 size={32} className="spin" />
      </div>
    )
  }

  if (!roadmap) {
    return (
      <div className="roadmap-empty">
        <h2>Дорожная карта</h2>
        <p>У этого проекта ещё нет дорожной карты. Сгенерируйте персональный план для вашего бизнеса.</p>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <><Loader2 size={16} className="spin" /> Генерация...</>
          ) : (
            'Сгенерировать дорожную карту'
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="roadmap-page">
      <div className="roadmap-header">
        <div className="roadmap-header-top">
          <h1>Дорожная карта</h1>
          <div className="project-picker-wrapper">
            <button className="project-picker-btn" onClick={() => setShowProjectPicker(p => !p)}>
              <span>{currentProject?.title || 'Выберите проект'}</span>
              <ChevronDown size={14} />
            </button>
            {showProjectPicker && (
              <div className="project-picker-dropdown">
                {businesses.map(b => (
                  <button
                    key={b.id}
                    className={`picker-item ${b.id === businessId ? 'active' : ''}`}
                    onClick={() => selectProject(b.id)}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="roadmap-progress">
          <div className="progress-info">
            <span>{completedCount} из {totalCount} шагов</span>
            <span className="progress-pct">{progressPct}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="steps-timeline">
        {roadmap.steps.map((step, idx) => {
          const isExpanded = expandedStep === step.id
          const canStart = step.status === 'AVAILABLE'
          const canReport = step.status === 'IN_PROGRESS'
          const isLocked = step.status === 'LOCKED'

          return (
            <div
              key={step.id}
              className={`step-card status-${step.status.toLowerCase()}`}
            >
              {/* Линия таймлайна */}
              {idx < roadmap.steps.length - 1 && (
                <div className={`timeline-line ${step.status === 'COMPLETED' ? 'done' : ''}`} />
              )}

              <div className="step-marker">
                <div className={`step-icon status-${step.status.toLowerCase()}`}>
                  {statusIcons[step.status]}
                </div>
              </div>

              <div className="step-body">
                <button
                  className="step-header"
                  onClick={() => !isLocked && setExpandedStep(isExpanded ? null : step.id)}
                  disabled={isLocked}
                >
                  <div className="step-title-block">
                    <span className="step-phase">{phaseLabels[step.phase] || step.phase}</span>
                    <h3 className="step-title">{step.title}</h3>
                  </div>
                  {!isLocked && (
                    isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />
                  )}
                </button>

                {isExpanded && (
                  <div className="step-details">
                    <div className="step-description">
                      <ReactMarkdown>{formatStepText(step.description)}</ReactMarkdown>
                    </div>

                    {step.tips && (
                      <div className="step-tips">
                        <strong>💡 Советы:</strong>
                        <ReactMarkdown>{formatStepText(step.tips)}</ReactMarkdown>
                      </div>
                    )}

                    {step.aiAnalysis && (
                      <div className="ai-analysis">
                        <strong>Анализ ИИ:</strong>
                        <ReactMarkdown>{step.aiAnalysis}</ReactMarkdown>
                      </div>
                    )}

                    {step.userReport && (
                      <div className="user-report">
                        <strong>Ваш отчёт:</strong>
                        <p>{step.userReport}</p>
                      </div>
                    )}

                    {canStart && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleStart(step.id)}
                        disabled={starting === step.id}
                      >
                        {starting === step.id ? (
                          <><Loader2 size={14} className="spin" /> Запуск...</>
                        ) : (
                          <><Play size={14} /> Начать этап</>
                        )}
                      </button>
                    )}

                    {canReport && (
                      <div className="report-form">
                        <div className="report-toggle">
                          <button
                            className={`toggle-btn ${reportSuccess ? 'active' : ''}`}
                            onClick={() => setReportSuccess(true)}
                          >
                            <CheckCircle2 size={14} /> Успешно
                          </button>
                          <button
                            className={`toggle-btn ${!reportSuccess ? 'active fail' : ''}`}
                            onClick={() => setReportSuccess(false)}
                          >
                            <AlertTriangle size={14} /> Не получилось
                          </button>
                        </div>
                        <textarea
                          className="report-textarea"
                          value={reportText}
                          onChange={e => setReportText(e.target.value)}
                          placeholder="Расскажите, что вы сделали и какой получили результат..."
                          rows={3}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={() => handleReport(step.id)}
                          disabled={reporting || !reportText.trim()}
                        >
                          {reporting ? (
                            <><Loader2 size={14} className="spin" /> Отправка...</>
                          ) : (
                            <><Send size={14} /> Отправить отчёт</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
