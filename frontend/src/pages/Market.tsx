import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import {
  Loader2, Search, RefreshCw, Building2, TrendingUp,
  Users, DollarSign, Sparkles, AlertCircle, Zap,
  BarChart3, Target, CheckCircle2, XCircle,
} from 'lucide-react'
import './Market.css'

interface Business {
  id: string
  title: string
  targetAudience?: string
  competitors?: string
  monetizationModel?: string
  description?: string
  uniqueValue?: string
  industry?: string
}

interface MarketSize {
  value: number
  unit: string
  label: string
  basis: string
  description: string
}

interface MarketSegment {
  name: string
  share: number
  description: string
  painPoints: string[]
  channels: string[]
}

interface MonetizationModel {
  name: string
  description: string
  pricing: string
  pros: string[]
  cons: string[]
  fit: string
  unitEconomics: string
  recommended: boolean
}

interface MarketAnalysis {
  businessId: string
  tam: MarketSize | null
  sam: MarketSize | null
  som: MarketSize | null
  segments: MarketSegment[]
  monetizationModels: MonetizationModel[]
  lastGeneratedAt: string | null
}

type Tab = 'market' | 'segments' | 'monetization' | 'competitors'

export default function MarketPage() {
  const [searchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''

  const [business, setBusiness] = useState<Business | null>(null)
  const [loadingBiz, setLoadingBiz] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('market')

  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (!businessId) return
    setLoadingBiz(true)
    api.get<Business>(`/businesses/${businessId}`)
      .then(setBusiness)
      .catch(() => {})
      .finally(() => setLoadingBiz(false))
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    api.get<MarketAnalysis>(`/market/${businessId}`)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
  }, [businessId])

  async function generateAnalysis() {
    if (!businessId) return
    setLoading(true)
    setError('')
    try {
      const result = await api.post<MarketAnalysis>(
        `/market/${businessId}/generate`,
        { hint: hint.trim() || undefined }
      )
      setAnalysis(result)
    } catch (e: any) {
      setError(e?.message || 'Ошибка генерации анализа')
    } finally {
      setLoading(false)
    }
  }

  if (!businessId) {
    return (
      <div className="market-page">
        <div className="market-empty">
          <h2>Выберите проект</h2>
          <p>Выберите бизнес-проект в боковой панели</p>
        </div>
      </div>
    )
  }

  if (loadingBiz) {
    return (
      <div className="market-page">
        <div className="market-empty"><Loader2 size={28} className="spin" /></div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'market', label: 'Рынок' },
    { key: 'segments', label: 'Сегменты' },
    { key: 'monetization', label: 'Монетизация' },
    { key: 'competitors', label: 'Конкуренты' },
  ]

  const hasAnalysis = analysis && analysis.tam

  return (
    <div className="market-page">
      <div className="market-wrap">

        <div className="market-header">
          <h1 className="market-title">{business?.title || 'Анализ рынка'}</h1>
          <div className="market-tabs">
            {tabs.map(t => (
              <button
                key={t.key}
                className={`market-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'market' && (
          <div className="market-section">
            <div className="comp-search-row">
              <div className="comp-search-box">
                <Search size={15} className="comp-search-icon" />
                <input
                  className="comp-search-input"
                  placeholder="Уточнение: регион, сегмент, ниша..."
                  value={hint}
                  onChange={e => setHint(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateAnalysis()}
                />
              </div>
              <button
                className="comp-analyze-btn"
                onClick={generateAnalysis}
                disabled={loading}
              >
                {loading
                  ? <><Loader2 size={14} className="spin" /> Генерация...</>
                  : hasAnalysis
                    ? <><RefreshCw size={14} /> Обновить ИИ-анализ</>
                    : <><Sparkles size={14} /> Сгенерировать ИИ-анализ</>
                }
              </button>
            </div>

            {error && (
              <div className="comp-error"><AlertCircle size={15} /> {error}</div>
            )}

            {loading && (
              <div className="tam-skeleton">
                <div className="tam-ring-skeleton" />
                <div className="tam-cards-skeleton">
                  {[1,2,3].map(i => (
                    <div key={i} className="tam-card-skeleton">
                      <div className="s-line w-50" />
                      <div className="s-line w-30" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && !hasAnalysis && (
              <div className="comp-empty comp-empty-initial">
                <BarChart3 size={32} strokeWidth={1.3} />
                <p>Нажмите «Сгенерировать ИИ-анализ», чтобы получить оценку TAM/SAM/SOM</p>
                <span>ИИ проанализирует рынок на основе данных проекта</span>
              </div>
            )}

            {!loading && hasAnalysis && (
              <>
                <div className="tam-section">
                  {(() => {
                    const t = analysis!.tam!.value
                    const s = analysis!.sam!.value
                    const o = analysis!.som!.value
                    const items = [
                      { key: 'TAM', label: analysis!.tam!.label, desc: analysis!.tam!.description, val: t, color: 'var(--orange)' },
                      { key: 'SAM', label: analysis!.sam!.label, desc: analysis!.sam!.description, val: s, color: 'rgba(245,166,35,.75)' },
                      { key: 'SOM', label: analysis!.som!.label, desc: analysis!.som!.description, val: o, color: 'rgba(245,166,35,.45)' },
                    ]
                    return (
                      <div className="tam-bars">
                        {items.map(it => (
                          <div key={it.key} className="tam-bar">
                            <div className="tam-bar-header">
                              <span className="tam-bar-key">{it.key}</span>
                              <span className="tam-bar-label">{it.label}</span>
                            </div>
                            <div className="tam-bar-track">
                              <div
                                className="tam-bar-fill"
                                style={{ width: `${(it.val / t) * 100}%`, background: it.color }}
                              />
                            </div>
                            <p className="tam-bar-desc">{it.desc}</p>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  <div className="tam-basis">
                    <Target size={13} />
                    <span>Оценка основана на: {analysis!.tam!.basis}</span>
                  </div>
                </div>

                <div className="tam-stats">
                  <div className="tam-stat">
                    <span className="tam-stat-label">TAM</span>
                    <span className="tam-stat-val">{analysis!.tam!.label}</span>
                    <span className="tam-stat-sub">{clean(analysis!.tam!.description)}</span>
                  </div>
                  <div className="tam-stat">
                    <span className="tam-stat-label">SAM</span>
                    <span className="tam-stat-val">{analysis!.sam!.label}</span>
                    <span className="tam-stat-sub">{clean(analysis!.sam!.description)}</span>
                  </div>
                  <div className="tam-stat">
                    <span className="tam-stat-label">SOM</span>
                    <span className="tam-stat-val">{analysis!.som!.label}</span>
                    <span className="tam-stat-sub">{clean(analysis!.som!.description)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'segments' && (
          <div className="market-section">
            {!hasAnalysis ? (
              <div className="comp-empty comp-empty-initial">
                <Users size={32} strokeWidth={1.3} />
                <p>Анализ сегментов не сгенерирован</p>
                <span>Перейдите во вкладку «Рынок» и запустите ИИ-анализ</span>
              </div>
            ) : analysis!.segments.length === 0 ? (
              <div className="comp-empty"><p>Сегменты не определены</p></div>
            ) : (
              <SegmentRings segments={analysis!.segments} />
            )}
          </div>
        )}

        {activeTab === 'monetization' && (
          <div className="market-section">
            {!hasAnalysis ? (
              <div className="comp-empty comp-empty-initial">
                <DollarSign size={32} strokeWidth={1.3} />
                <p>Модели монетизации не сгенерированы</p>
                <span>Перейдите во вкладку «Рынок» и запустите ИИ-анализ</span>
              </div>
            ) : analysis!.monetizationModels.length === 0 ? (
              <div className="comp-empty"><p>Модели не определены</p></div>
            ) : (
              <div className="mono-detail-grid">
                {analysis!.monetizationModels.map((m, i) => (
                  <div key={i} className={`mono-detail-card ${m.recommended ? 'mono-recommended' : ''}`}>
                    <div className="mono-detail-top">
                      <div className="mono-detail-num">{i + 1}</div>
                      <div>
                        <div className="mono-detail-name">{clean(m.name)}</div>
                        {m.recommended && (
                          <div className="mono-detail-badge"><Zap size={11} /> Рекомендуемая</div>
                        )}
                      </div>
                    </div>
                    <p className="mono-detail-desc">{clean(m.description)}</p>
                    <div className="mono-detail-row">
                      <span className="mono-detail-row-label">Цена</span>
                      <span className="mono-detail-row-val">{clean(m.pricing)}</span>
                    </div>
                    <div className="mono-detail-row">
                      <span className="mono-detail-row-label">Для кого</span>
                      <span className="mono-detail-row-val">{clean(m.fit)}</span>
                    </div>
                    <div className="mono-detail-row">
                      <span className="mono-detail-row-label">Unit-экономика</span>
                      <span className="mono-detail-row-val">{clean(m.unitEconomics)}</span>
                    </div>
                    <div className="mono-detail-proscons">
                      <div className="mono-detail-pros">
                        <span><CheckCircle2 size={11} /> Плюсы</span>
                        <ul>{m.pros.map((p, j) => <li key={j}>{clean(p)}</li>)}</ul>
                      </div>
                      <div className="mono-detail-cons">
                        <span><XCircle size={11} /> Минусы</span>
                        <ul>{m.cons.map((p, j) => <li key={j}>{clean(p)}</li>)}</ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'competitors' && (
          <CompetitorsTab businessId={businessId} />
        )}

      </div>
    </div>
  )
}

function CompetitorsTab({ businessId }: { businessId: string }) {
  const [competitors, setCompetitors] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')

  async function analyze() {
    setLoading(true)
    setError('')
    try {
      const res = await api.post(`/businesses/${businessId}/competitors/analyze`, {
        hint: hint.trim() || undefined, aiTier: 'PREMIUM'
      })
      setCompetitors(res)
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="market-section">
      <div className="comp-search-row">
        <div className="comp-search-box">
          <Search size={15} className="comp-search-icon" />
          <input
            className="comp-search-input"
            placeholder="Регион, сегмент, ниша..."
            value={hint}
            onChange={e => setHint(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyze()}
          />
        </div>
        <button className="comp-analyze-btn" onClick={analyze} disabled={loading}>
          {loading
            ? <><Loader2 size={14} className="spin" /> Анализ...</>
            : competitors ? <><RefreshCw size={14} /> Обновить</>
              : <><Sparkles size={14} /> Найти конкурентов</>
          }
        </button>
      </div>

      {error && <div className="comp-error"><AlertCircle size={15} /> {error}</div>}

      {loading && (
        <div className="comp-list">
          {[1,2,3].map(i => (
            <div key={i} className="comp-card comp-card-skeleton">
              <div className="skeleton-line w-60" />
              <div className="skeleton-line w-40" />
              <div className="skeleton-line w-80" />
            </div>
          ))}
        </div>
      )}

      {!loading && competitors?.items?.length > 0 && (
        <>
          <div className="comp-meta">
            Найдено: <strong>{competitors.foundCount}</strong> компаний
          </div>
          <div className="comp-list">
            {competitors.items.map((item: any, i: number) => {
              const c = item.fnsCard
              return (
                <div key={i} className="comp-card">
                  <div className="comp-card-header" style={{ cursor: 'default' }}>
                    <div className="comp-card-title-row">
                      <Building2 size={15} className="comp-icon" />
                      <span className="comp-name">{c?.name || item.candidate.name}</span>
                    </div>
                    <div className="comp-card-meta-row">
                      {c?.legalForm && <span className="comp-meta-chip">{c.legalForm}</span>}
                      {c?.inn && <span className="comp-meta-chip">ИНН {c.inn}</span>}
                      {c?.region && <span className="comp-meta-chip">{c.region}</span>}
                    </div>
                  </div>
                  {c && (
                    <div className="comp-card-body" style={{ borderTop: '1px solid var(--surface-border)' }}>
                      <div className="comp-fields">
                        {c.status && (
                          <div className="comp-field">
                            <span className="comp-field-label">Статус</span>
                            <span className="comp-field-val">{c.status}</span>
                          </div>
                        )}
                        {c.registrationDate && (
                          <div className="comp-field">
                            <span className="comp-field-label">Зарегистрирована</span>
                            <span className="comp-field-val">{c.registrationDate}</span>
                          </div>
                        )}
                        {c.address && (
                          <div className="comp-field">
                            <span className="comp-field-label">Адрес</span>
                            <span className="comp-field-val">{c.address}</span>
                          </div>
                        )}
                        {c.okvedMain && (
                          <div className="comp-field">
                            <span className="comp-field-label">ОКВЭД</span>
                            <span className="comp-field-val">{c.okvedMain.code} — {c.okvedMain.name}</span>
                          </div>
                        )}
                      </div>
                      {c.financials && (
                        <div className="comp-financials">
                          <div className="comp-fin-title"><TrendingUp size={13} /> Финансы</div>
                          <div className="comp-fin-grid">
                            {c.financials.revenue !== undefined && (
                              <div className="comp-fin-item">
                                <span className="comp-fin-label">Выручка</span>
                                <span className="comp-fin-val">{fmtMoney(c.financials.revenue)}</span>
                              </div>
                            )}
                            {c.financials.netProfit !== undefined && (
                              <div className="comp-fin-item">
                                <span className="comp-fin-label">Прибыль</span>
                                <span className="comp-fin-val">{fmtMoney(c.financials.netProfit)}</span>
                              </div>
                            )}
                            {c.financials.employees !== undefined && (
                              <div className="comp-fin-item">
                                <span className="comp-fin-label">Сотрудников</span>
                                <span className="comp-fin-val">{c.financials.employees}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="comp-disclaimer">Данные ФНС РФ (ЕГРЮЛ/ЕГРИП)</p>
        </>
      )}

      {!loading && !competitors && !error && (
        <div className="comp-empty comp-empty-initial">
          <Sparkles size={32} strokeWidth={1.3} />
          <p>Нажмите «Найти конкурентов», чтобы получить список из ЕГРЮЛ</p>
        </div>
      )}
    </div>
  )
}

function SegmentRings({ segments }: { segments: MarketSegment[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const active = hovered !== null ? segments[hovered] : null
  const container = 440
  const maxSize = 440
  const minSize = 100
  const count = segments.length
  const step = count > 1 ? (maxSize - minSize) / (count - 1) : 0

  const labelPositions = [
    { top: '16px', left: '50%', transform: 'translateX(-50%)' },
    { bottom: '16px', left: '50%', transform: 'translateX(-50%)' },
  ]

  const rings = segments.map((seg, i) => {
    const size = Math.round(maxSize - i * step)
    const offset = (container - size) / 2
    const ratio = count > 1 ? i / (count - 1) : 0
    const borderAlpha = 0.22 + ratio * 0.28
    const bgAlpha = 0.04 + ratio * 0.10
    return { seg, size, offset, labelPos: labelPositions[i % labelPositions.length], borderAlpha, bgAlpha }
  })

  return (
    <div className="seg-rings-wrap">
      <div className="seg-rings" style={{ width: container, height: container }}>
        {rings.map(({ seg, size, offset, labelPos, borderAlpha, bgAlpha }, i) => (
          <div
            key={i}
            className="seg-ring"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: size,
              height: size,
              top: offset,
              left: offset,
              zIndex: i + 1,
              borderColor: `rgba(245,166,35,${borderAlpha})`,
              background: `rgba(245,166,35,${bgAlpha})`,
            }}
          >
            <div className="seg-ring-inner">
              <div className="seg-ring-label" style={labelPos}>
                <span>{shortName(seg.name)}</span>
                <small>{seg.share}%</small>
              </div>
            </div>
          </div>
        ))}
      </div>

      {active && (
        <div className="seg-detail-panel">
          <div className="seg-detail-panel-header">
            <span className="seg-detail-panel-name">{active.name}</span>
            <span className="seg-detail-panel-share">{active.share}% от SOM</span>
          </div>
          <p className="seg-detail-panel-desc">{clean(active.description)}</p>
          <div className="seg-detail-panel-block">
            <span className="seg-detail-panel-block-title">Боли и задачи</span>
            <ul>{active.painPoints.map((p, i) => <li key={i}>{clean(p)}</li>)}</ul>
          </div>
          <div className="seg-detail-panel-block">
            <span className="seg-detail-panel-block-title">Каналы</span>
            <div className="seg-detail-panel-chips">{active.channels.map((c, i) => <span key={i} className="seg-detail-panel-chip">{clean(c)}</span>)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function shortName(s?: string): string {
  if (!s) return ''
  const words = s.split(/\s+/)
  if (words.length <= 3) return s
  return words.slice(0, 3).join(' ') + '…'
}

function clean(s: string): string {
  if (!s) return ''
  return s
    .replace(/event-/gi, 'мероприятие-')
    .replace(/Event-/g, 'Мероприятие-')
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} млрд ₽`
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₽`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} тыс ₽`
  return `${n} ₽`
}
