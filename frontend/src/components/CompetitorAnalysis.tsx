import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { X, Loader2, AlertCircle, RefreshCw, Building2 } from 'lucide-react'
import './CompetitorAnalysis.css'

interface FnsOkved {
  code: string
  name: string
}

interface FnsCompanyCard {
  kind: 'UL' | 'IP'
  inn: string
  ogrn: string
  kpp?: string
  name: string
  fullName?: string
  legalForm?: string
  status?: string
  active: boolean
  registrationDate?: string
  terminationDate?: string
  terminationReason?: string
  address?: string
  region?: string
  director?: string
  directorPosition?: string
  authorizedCapital?: string
  okvedMain?: FnsOkved
  okvedAdditional?: FnsOkved[]
  financials?: {
    year?: number
    revenue?: number
    netProfit?: number
    employees?: number
  }
  source: string
  fetchedAt: string
}

interface CompetitorCandidate {
  name: string
  legalName?: string | null
  inn?: string | null
  ogrn?: string | null
  reason?: string | null
  confidence?: 'high' | 'medium' | 'low' | null
}

interface CompetitorAnalysisItem {
  candidate: CompetitorCandidate
  fnsCard?: FnsCompanyCard
  fromCache: boolean
  matchScore: number
  notFoundReason?: string
}

interface CompetitorAnalysisResult {
  businessId: string
  generatedAt: string
  totalCandidates: number
  foundCount: number
  items: CompetitorAnalysisItem[]
  summaryMarkdown: string
}

interface Props {
  businessId: string
  hint?: string
  aiTier?: 'PLUS' | 'PREMIUM'
  onClose?: () => void
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return Math.round(value).toLocaleString('ru-RU')
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('ru-RU')
  } catch {
    return dateStr
  }
}

export default function CompetitorAnalysis({ businessId, hint, aiTier, onClose }: Props) {
  const [result, setResult] = useState<CompetitorAnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    setResult(null)
    api.post<CompetitorAnalysisResult>(`/businesses/${businessId}/competitors/analyze`, {
      hint: hint || '',
      limit: 15,
      aiTier,
    })
      .then(data => { setResult(data); setLoading(false) })
      .catch(err => { setError(err.message || 'Не удалось загрузить данные'); setLoading(false) })
  }

  useEffect(() => { load() }, [businessId, hint, aiTier])

  const found = result?.items.filter(i => i.fnsCard) ?? []

  return (
    <div className="ca-panel">
      <div className="ca-header">
        <div className="ca-title">
          <Building2 size={13} />
          Конкуренты по ЕГРЮЛ
        </div>
        <div className="ca-header-actions">
          {!loading && (
            <button className="ca-icon-btn" onClick={load} title="Обновить">
              <RefreshCw size={13} />
            </button>
          )}
          {onClose && (
            <button className="ca-icon-btn" onClick={onClose} title="Закрыть">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="ca-body">
        {loading && (
          <div className="ca-state">
            <Loader2 size={16} className="spin" />
            <span>Запрашиваю ЕГРЮЛ…</span>
          </div>
        )}

        {!loading && error && (
          <div className="ca-state ca-state-error">
            <AlertCircle size={14} />
            <span>{error}</span>
            <button className="ca-retry" onClick={load}>Повторить</button>
          </div>
        )}

        {!loading && !error && found.length === 0 && (
          <div className="ca-state">
            <AlertCircle size={14} />
            <span>Компании не найдены в ЕГРЮЛ. Попробуйте уточнить отрасль в настройках проекта.</span>
          </div>
        )}

        {!loading && !error && found.length > 0 && (
          <div className="ca-list">
            <div className="ca-count">{found.length} компаний из ЕГРЮЛ/ЕГРИП</div>
            {found.map((item, idx) => {
              const c = item.fnsCard!
              return (
                <div className="ca-card" key={idx}>
                  <div className="ca-card-top">
                    <span className="ca-card-name" title={c.fullName || c.name}>{c.name}</span>
                    <span className={`ca-badge ${c.active ? 'active' : 'inactive'}`}>
                      {c.active ? 'Действует' : 'Закрыто'}
                    </span>
                  </div>
                  <div className="ca-card-meta">
                    <span className="ca-mono">ИНН {c.inn}</span>
                    {c.registrationDate && <span>с {formatDate(c.registrationDate)}</span>}
                    {c.okvedMain && <span title={c.okvedMain.name}>{c.okvedMain.code}</span>}
                  </div>
                  {c.address && (
                    <div className="ca-card-addr" title={c.address}>
                      {c.address.length > 60 ? c.address.slice(0, 60) + '…' : c.address}
                    </div>
                  )}
                  {c.financials && (c.financials.revenue !== undefined || c.financials.employees !== undefined) && (
                    <div className="ca-card-fin">
                      {c.financials.revenue !== undefined && (
                        <span>Выручка: {formatMoney(c.financials.revenue)} ₽{c.financials.year ? ` (${c.financials.year})` : ''}</span>
                      )}
                      {c.financials.employees !== undefined && (
                        <span>{c.financials.employees} сотр.</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="ca-footer">
        Источник: ФНС РФ (ЕГРЮЛ/ЕГРИП)
      </div>
    </div>
  )
}
