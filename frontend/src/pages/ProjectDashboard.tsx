import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  MessageSquare, Map, Sparkles, Users, ArrowLeft, RefreshCw,
  Target, Lightbulb, DollarSign, Layers, Globe,
  TrendingUp, PieChart, Zap, Edit3, Check, X, ChevronDown,
} from 'lucide-react'
import { api } from '../api/client'
import './ProjectDashboard.css'

interface Business {
  id: string
  title: string
  description: string | null
  industry: string | null
  status: string
  problemStatement: string | null
  targetAudience: string | null
  uniqueValue: string | null
  monetizationModel: string | null
  marketSize: string | null
  createdAt: string
}

interface Canvas {
  id: string
  problem: string | null
  segments: string | null
  valueProposition: string | null
  solution: string | null
  channels: string | null
  market: string | null
  metrics: string | null
  costStructure: string | null
  revenueStructure: string | null
  unitEconomics: string | null
  unfairAdvantage: string | null
  lastGeneratedAt: string | null
  generationSource: string | null
}

const statusLabels: Record<string, string> = {
  IDEA_GENERATION: 'Идея',
  IDEA_DEFINED: 'Идея оформлена',
  ANALYSIS: 'Анализ',
  VALIDATION: 'Валидация',
  MVP: 'MVP',
  ITERATION: 'Итерация',
  LAUNCHED: 'Запущен',
}

interface CanvasBlock {
  key: keyof Canvas
  label: string
  icon: React.ReactNode
  color: string
  gridArea: string
  description: string
}

const CANVAS_BLOCKS: CanvasBlock[] = [
  // Строка 1
  { key: 'problem',          label: 'Проблема / Боль',          icon: <Target size={14} />,    color: '#ef4444', gridArea: 'problem',   description: 'Ключевые боли клиента' },
  { key: 'segments',         label: 'Клиентские сегменты',      icon: <Users size={14} />,     color: '#3b82f6', gridArea: 'segments',  description: 'Кто ваш клиент' },
  { key: 'valueProposition', label: 'Ценностное предложение',   icon: <Sparkles size={14} />,  color: '#8b5cf6', gridArea: 'value',     description: 'Уникальное предложение' },
  // Строка 2
  { key: 'solution',         label: 'Решение / Продукт',        icon: <Lightbulb size={14} />, color: '#22c55e', gridArea: 'solution',  description: 'Продукт и артефакты' },
  { key: 'channels',         label: 'Каналы',                   icon: <Globe size={14} />,     color: '#f59e0b', gridArea: 'channels',  description: 'Каналы привлечения' },
  { key: 'metrics',          label: 'Ключевые метрики',         icon: <TrendingUp size={14} />,color: '#f97316', gridArea: 'metrics',   description: 'AARRR, воронка' },
  // Строка 3
  { key: 'costStructure',    label: 'Структура расходов',       icon: <Layers size={14} />,    color: '#64748b', gridArea: 'costs',     description: 'Постоянные и переменные расходы' },
  { key: 'unitEconomics',    label: 'Unit-экономика',           icon: <PieChart size={14} />,  color: '#ec4899', gridArea: 'unit',      description: 'CAC, LTV, ARPU' },
  { key: 'revenueStructure', label: 'Структура доходов',        icon: <DollarSign size={14} />,color: '#10b981', gridArea: 'revenue',   description: 'Модель монетизации' },
  // Полная ширина
  { key: 'unfairAdvantage',  label: 'Конкурентное преимущество',icon: <Zap size={14} />,       color: '#a855f7', gridArea: 'advantage', description: 'Несправедливое преимущество' },
]

function splitBullets(text: string): string[] {
  return text
    // Разбиваем по переносам строк или по паттерну ". 2)" / ". 3)" внутри строки
    .split(/\n|\.\s+(?=\d+[.)]\s)/)
    .flatMap(s => s.split(/(?<=\S)\s+\d+[.)]\s+/))  // дополнительный сплит по " 2) " в середине
    .map(s => s
      .replace(/^\d+[.)]\s*/, '')   // убрать "1) " в начале
      .replace(/^[-–—•*]\s*/, '')   // убрать "- " в начале
      .replace(/\.$/, '')           // убрать точку в конце
      .trim()
    )
    .filter(s => s.length > 3)
}

export default function ProjectDashboard() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const businessId = searchParams.get('businessId') || ''

  const [business, setBusiness] = useState<Business | null>(null)
  const [canvas, setCanvas] = useState<Canvas | null>(null)
  const [loadingBiz, setLoadingBiz] = useState(true)
  const [loadingCanvas, setLoadingCanvas] = useState(true)
  const [generating, setGenerating] = useState(false)

  const [editingBlock, setEditingBlock] = useState<keyof Canvas | null>(null)
  const [editValue, setEditValue] = useState('')
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId) return
    setLoadingBiz(true)
    api.get<Business>(`/businesses/${businessId}`)
      .then(setBusiness)
      .catch(() => {})
      .finally(() => setLoadingBiz(false))

    setLoadingCanvas(true)
    api.get<{ data: Canvas | null }>(`/canvas/${businessId}`)
      .then(res => setCanvas((res as any).data ?? res as any))
      .catch(() => setCanvas(null))
      .finally(() => setLoadingCanvas(false))
  }, [businessId])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await api.post<any>(`/canvas/${businessId}/generate`, {})
      setCanvas(res.data ?? res)
    } catch (e) {
      console.error('Canvas generation failed:', e)
    } finally {
      setGenerating(false)
    }
  }

  function startEdit(block: CanvasBlock) {
    setEditingBlock(block.key)
    setEditValue(canvas?.[block.key] as string || '')
  }

  async function saveEdit() {
    if (!editingBlock) return
    try {
      const res = await api.patch<any>(`/canvas/${businessId}`, { [editingBlock]: editValue })
      setCanvas(res.data ?? res)
    } catch (e) {
      console.error('Canvas update failed:', e)
    } finally {
      setEditingBlock(null)
    }
  }

  if (!businessId) {
    return (
      <div className="pd-empty">
        <p>Проект не выбран</p>
        <button className="pd-btn" onClick={() => navigate('/')}>На главную</button>
      </div>
    )
  }

  return (
    <div className="pd-page">
      {/* Header */}
      <div className="pd-header">
        <button className="pd-back" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> К проектам
        </button>
        {loadingBiz ? (
          <div className="pd-title-skeleton" />
        ) : (
          <div className="pd-title-block">
            <h1 className="pd-title">{business?.title}</h1>
            {business?.status && (
              <span className="pd-status">{statusLabels[business.status] || business.status}</span>
            )}
          </div>
        )}
        <div className="pd-header-actions">
          <button className="pd-btn pd-btn-ghost" onClick={() => navigate(`/chat?businessId=${businessId}`)}>
            <MessageSquare size={15} /> Чат
          </button>
          <button className="pd-btn pd-btn-ghost" onClick={() => navigate(`/roadmap?businessId=${businessId}`)}>
            <Map size={15} /> Роадмап
          </button>
          <button className="pd-btn pd-btn-ghost" onClick={() => navigate(`/interview?businessId=${businessId}`)}>
            <Users size={15} /> Интервью
          </button>
        </div>
      </div>

      {/* Info row */}
      {business && (
        <div className="pd-info-row">
          {([  
            { key: 'description', label: 'Описание', val: business.description },
            { key: 'industry', label: 'Отрасль', val: business.industry },
            { key: 'targetAudience', label: 'Аудитория', val: business.targetAudience },
            { key: 'marketSize', label: 'Рынок', val: business.marketSize },
          ] as { key: string; label: string; val: string | null }[]).filter(f => f.val).map(field => (
            <button
              key={field.key}
              className={`pd-info-pill ${expandedInfo === field.key ? 'expanded' : ''}`}
              onClick={() => setExpandedInfo(expandedInfo === field.key ? null : field.key)}
            >
              <div className="pd-pill-top">
                <span className="pd-pill-label">{field.label}</span>
                <ChevronDown size={13} className="pd-pill-arrow" />
              </div>
              {expandedInfo === field.key && (
                <span className="pd-pill-text">{field.val}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Canvas section */}
      <div className="pd-canvas-header">
        <div className="pd-canvas-title-row">
          <h2 className="pd-canvas-title">Карта бизнес-модели</h2>
          {canvas?.lastGeneratedAt && (
            <span className="pd-canvas-updated">
              Обновлено {new Date(canvas.lastGeneratedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          className={`pd-btn pd-btn-primary ${generating ? 'pd-btn-loading' : ''}`}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
          {generating ? 'Генерация...' : canvas ? 'Обновить ИИ' : 'Сгенерировать ИИ'}
        </button>
      </div>

      {loadingCanvas ? (
        <div className="pd-canvas-skeleton">
          {CANVAS_BLOCKS.map(b => <div key={b.key} className="pd-canvas-block-skeleton" />)}
        </div>
      ) : !canvas ? (
        <div className="pd-canvas-empty">
          <Sparkles size={36} strokeWidth={1.2} />
          <p>Нажмите «Сгенерировать ИИ», чтобы создать карту бизнес-модели</p>
          <span>ИИ проанализирует ваш проект, чаты с наставником и подтверждённые гипотезы</span>
        </div>
      ) : (
        <div className="pd-canvas-grid">
          {CANVAS_BLOCKS.map(block => (
            <div
              key={block.key}
              className="pd-canvas-block"
              style={{ '--block-color': block.color } as React.CSSProperties}
              data-area={block.gridArea}
            >
              <div className="pd-block-header">
                <span className="pd-block-icon" style={{ color: block.color }}>{block.icon}</span>
                <span className="pd-block-label">{block.label}</span>
                <button
                  className="pd-block-edit"
                  onClick={() => startEdit(block)}
                  title="Редактировать"
                >
                  <Edit3 size={12} />
                </button>
              </div>

              {editingBlock === block.key ? (
                <div className="pd-block-edit-form">
                  <textarea
                    className="pd-block-textarea"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    rows={5}
                  />
                  <div className="pd-block-edit-actions">
                    <button className="pd-block-save" onClick={saveEdit}><Check size={13} /></button>
                    <button className="pd-block-cancel" onClick={() => setEditingBlock(null)}><X size={13} /></button>
                  </div>
                </div>
              ) : (
                <div className="pd-block-content">
                  {canvas[block.key] ? (
                    <ul className="pd-block-bullets">
                      {splitBullets(canvas[block.key] as string).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pd-block-empty">{block.description}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
