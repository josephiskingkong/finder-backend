import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import ReactMarkdown from 'react-markdown'
import {
  Play, CheckCircle2,
  AlertTriangle, Loader2, Send, X, Clock, Check
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

function formatStepText(text: string): string {
  return text
    .replace(/(?<!\n)\s*Шаг\s+(\d+)\s*[:\.]\s*/gi, '\n\n**Шаг $1.** ')
    .replace(/(?<!\n)(?<=[\.\!\?])\s+(\d+)\.\s+/g, '\n\n$1. ')
    .trim()
}

export default function RoadmapPage() {
  const [searchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''

  const [businesses, setBusinesses] = useState<BusinessItem[]>([])
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedStep, setSelectedStep] = useState<RoadmapStep | null>(null)
  const [reportText, setReportText] = useState('')
  const [reportSuccess, setReportSuccess] = useState(true)
  const [reporting, setReporting] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    api.get<BusinessItem[]>('/businesses').then(setBusinesses).catch(() => {})
  }, [])

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
    } catch {} finally {
      setGenerating(false)
    }
  }

  const handleStart = async (stepId: string) => {
    setStarting(stepId)
    try {
      await api.patch(`/roadmap/steps/${stepId}/start`)
      await loadRoadmap()
    } catch {} finally {
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
    } catch {} finally {
      setReporting(false)
    }
  }

  if (!businessId) {
    return (
      <div className="roadmap-page">
        <div className="roadmap-empty">
          <h2>Выберите проект</h2>
          <p>Выберите бизнес-проект в боковой панели, чтобы увидеть дорожную карту</p>
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
      <div className="roadmap-page">
        <div className="roadmap-empty">
          <h2>Дорожная карта</h2>
          <p>У этого проекта ещё нет дорожной карты. Сгенерируйте персональный план.</p>
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
      </div>
    )
  }

  return (
    <div className="roadmap-page">
      {/* Panel overlay when step is selected */}
      {selectedStep && (
        <div className="roadmap-panel-overlay" onClick={() => setSelectedStep(null)}>
          <div className="roadmap-panel" onClick={e => e.stopPropagation()}>
            <button className="roadmap-panel-close" onClick={() => setSelectedStep(null)}>
              <X size={20} />
            </button>
            <h2 className="roadmap-panel-title">Этапы плана</h2>
            <div className="roadmap-panel-content">
              <h3>{selectedStep.title}</h3>
              <div className="panel-description">
                <ReactMarkdown>{formatStepText(selectedStep.description)}</ReactMarkdown>
              </div>
              {selectedStep.tips && (
                <div className="panel-tips">
                  <strong>💡 Советы:</strong>
                  <ReactMarkdown>{formatStepText(selectedStep.tips)}</ReactMarkdown>
                </div>
              )}
              {selectedStep.aiAnalysis && (
                <div className="panel-analysis">
                  <strong>Анализ ИИ:</strong>
                  <ReactMarkdown>{selectedStep.aiAnalysis}</ReactMarkdown>
                </div>
              )}
              {selectedStep.userReport && (
                <div className="panel-report">
                  <strong>Ваш отчёт:</strong>
                  <p>{selectedStep.userReport}</p>
                </div>
              )}
              {selectedStep.status === 'AVAILABLE' && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleStart(selectedStep.id)}
                  disabled={starting === selectedStep.id}
                >
                  {starting === selectedStep.id ? (
                    <><Loader2 size={14} className="spin" /> Запуск...</>
                  ) : (
                    <><Play size={14} /> Начать этап</>
                  )}
                </button>
              )}
              {selectedStep.status === 'IN_PROGRESS' && (
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
                    placeholder="Расскажите, что вы сделали..."
                    rows={3}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => handleReport(selectedStep.id)}
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
          </div>
        </div>
      )}

      <h1 className="roadmap-title">Этапы плана</h1>

      {/* Organic zigzag bubble map with curved connectors */}
      <RoadmapMap
        steps={roadmap.steps}
        phaseLabels={phaseLabels}
        onSelect={s => s.status !== 'LOCKED' && setSelectedStep(s)}
      />
    </div>
  )
}

// === Organic hand-drawn map with zigzag bubbles and curved dashed connectors ===
function RoadmapMap({
  steps,
  phaseLabels,
  onSelect,
}: {
  steps: RoadmapStep[]
  phaseLabels: Record<string, string>
  onSelect: (step: RoadmapStep) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([])
  const [paths, setPaths] = useState<string[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const recalc = () => {
      const container = containerRef.current
      if (!container) return
      const cRect = container.getBoundingClientRect()
      setSize({ w: cRect.width, h: cRect.height })

      const newPaths: string[] = []
      for (let i = 0; i < bubbleRefs.current.length - 1; i++) {
        const a = bubbleRefs.current[i]
        const b = bubbleRefs.current[i + 1]
        if (!a || !b) continue
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        // Exit from bottom-center of A, enter top-center of B
        const x1 = ar.left + ar.width / 2 - cRect.left
        const y1 = ar.bottom - cRect.top
        const x2 = br.left + br.width / 2 - cRect.left
        const y2 = br.top - cRect.top

        // Determine which side to loop OUT on: opposite of where the next bubble sits
        // If next bubble is to the right of current → loop OUT to the right (past it)
        // If next is to the left → loop OUT to the left.
        const goingRight = x2 >= x1
        const loopSide = goingRight ? 1 : -1
        const containerWidth = cRect.width
        // Swing extends far beyond the bubble centers to create a true "loop" / teardrop
        const swing = Math.min(containerWidth * 0.55, 220)
        const cp1x = x1 + swing * loopSide
        const cp1y = y1 + (y2 - y1) * 0.15
        const cp2x = x2 + swing * loopSide
        const cp2y = y2 - (y2 - y1) * 0.15
        newPaths.push(`M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`)
      }
      setPaths(newPaths)
    }
    recalc()
    const ro = new ResizeObserver(recalc)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', recalc)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recalc)
    }
  }, [steps.length])

  return (
    <div className="rmap" ref={containerRef}>
      <svg className="rmap-svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.6"
            strokeDasharray="5 5"
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div className="rmap-list">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'COMPLETED'
          const isInProgress = step.status === 'IN_PROGRESS'
          const isLocked = step.status === 'LOCKED'
          const align = idx % 2 === 0 ? 'left' : 'right'
          const label = phaseLabels[step.phase] || step.title

          return (
            <div key={step.id} className={`rmap-row align-${align}`}>
              <DashedBubble
                ref={el => { bubbleRefs.current[idx] = el }}
                status={step.status.toLowerCase() as any}
                onClick={() => onSelect(step)}
              >
                <span className="rmap-label">{label}</span>
                {isCompleted && (
                  <span className="rmap-badge badge-check" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                {isInProgress && (
                  <span className="rmap-badge badge-clock" aria-hidden>
                    <Clock size={12} />
                  </span>
                )}
                {isLocked && <span className="rmap-lock-dot" aria-hidden />}
              </DashedBubble>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Wrapper that passes ref properly and adds data attribute for styling
const DashedBubble = ({
  children,
  status,
  onClick,
  ref: forwardRef,
}: {
  children: React.ReactNode
  status: 'completed' | 'in_progress' | 'available' | 'locked' | 'failed' | 'skipped'
  onClick: () => void
  ref?: React.Ref<HTMLDivElement>
}) => {
  return (
    <div
      ref={forwardRef}
      className={`rmap-bubble status-${status}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
