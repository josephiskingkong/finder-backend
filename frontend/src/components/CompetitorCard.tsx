import { Building2, MapPin, Calendar, Hash, TrendingUp, AlertCircle, Loader2, UserCircle, Briefcase, Banknote } from 'lucide-react'
import './CompetitorCard.css'

interface FnsOkved { code: string; name: string }
interface FnsFinancials { year?: number; revenue?: number; netProfit?: number; employees?: number }

export interface FnsCompanyCard {
  kind: 'UL' | 'IP'
  inn: string
  ogrn?: string
  name: string
  fullName?: string
  legalForm?: string
  status?: string
  active: boolean
  registrationDate?: string
  address?: string
  region?: string
  director?: string
  directorPosition?: string
  authorizedCapital?: string
  okvedMain?: FnsOkved
  okvedAdditional?: FnsOkved[]
  financials?: FnsFinancials
}

export interface CompetitorAnalysisResult {
  businessId: string
  generatedAt: string
  totalCandidates: number
  foundCount: number
  items: Array<{ candidate: { name: string; inn?: string | null }; fnsCard?: FnsCompanyCard }>
  summaryMarkdown: string
}

interface Props {
  result: CompetitorAnalysisResult
  loading?: boolean
  error?: string
  tier?: 'PLUS' | 'PREMIUM'
}

function formatDate(s?: string) {
  if (!s) return null
  try { return new Date(s).toLocaleDateString('ru-RU') } catch { return s }
}

function formatMoney(v: number) {
  return Math.round(v).toLocaleString('ru-RU')
}

function shortAddr(addr?: string) {
  if (!addr) return null
  const parts = addr.split(',').map(s => s.trim())
  const city = parts.find(p => /^(г\.|город|г\s)/i.test(p))
  const region = parts.find(p => /обл\.|область|респ\.|край/i.test(p))
  return city || region || parts[0] || null
}

export default function CompetitorCard({ result, loading, error, tier }: Props) {
  const found = result?.items.filter(i => i.fnsCard) ?? []

  return (
    <div className="cc-wrap">
      <div className="cc-header">
        <div className="cc-header-icon">
          <TrendingUp size={15} />
        </div>
        <div className="cc-header-text">
          <span className="cc-header-title">Анализ конкурентов · ЕГРЮЛ/ЕГРИП</span>
          {!loading && !error && (
            <span className="cc-header-sub">
              {found.length > 0
                ? `Найдено ${found.length} компани${found.length === 1 ? 'я' : found.length < 5 ? 'и' : 'й'}`
                : 'Не найдено совпадений'}
              {tier && <span className="cc-tier-badge">{tier}</span>}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="cc-state">
          <Loader2 size={14} className="cc-spin" />
          <span>Ищем конкурентов в реестре ФНС…</span>
        </div>
      )}

      {!loading && error && (
        <div className="cc-state cc-state-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && found.length === 0 && (
        <div className="cc-state">
          <AlertCircle size={14} />
          <span>По данной нише компании в ЕГРЮЛ не найдены. Попробуйте уточнить отрасль в настройках проекта.</span>
        </div>
      )}

      {!loading && !error && found.length > 0 && (
        <div className="cc-list">
          {found.map((item, i) => {
            const c = item.fnsCard!
            const loc = shortAddr(c.address)
            const date = formatDate(c.registrationDate)
            return (
              <div className="cc-card" key={i}>
                <div className="cc-card-row cc-card-top">
                  <a
                    className="cc-card-name cc-card-name-link"
                    href={`https://egrul.nalog.ru/index.html?query=${c.inn}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Открыть в ЕГРЮЛ/ЕГРИП на nalog.ru"
                  >
                    {c.name}
                  </a>
                  <span className={`cc-status ${c.active ? 'cc-status-active' : 'cc-status-inactive'}`}>
                    {c.active ? 'Действует' : 'Закрыто'}
                  </span>
                </div>

                {c.fullName && c.fullName !== c.name && (
                  <div className="cc-card-row cc-card-fullname">{c.fullName}</div>
                )}

                <div className="cc-card-row cc-card-meta">
                  <span className="cc-meta-chip">
                    <Hash size={10} />
                    ИНН {c.inn}
                  </span>
                  {c.ogrn && (
                    <span className="cc-meta-chip">
                      <Hash size={10} />
                      ОГРН {c.ogrn}
                    </span>
                  )}
                  {loc && (
                    <span className="cc-meta-chip">
                      <MapPin size={10} />
                      {loc}
                    </span>
                  )}
                  {date && (
                    <span className="cc-meta-chip">
                      <Calendar size={10} />
                      с {date}
                    </span>
                  )}
                </div>

                {c.director && (
                  <div className="cc-card-row cc-card-detail">
                    <UserCircle size={12} />
                    <span>{c.director}{c.directorPosition ? `, ${c.directorPosition}` : ''}</span>
                  </div>
                )}

                {c.address && (
                  <div className="cc-card-row cc-card-detail">
                    <MapPin size={12} />
                    <span>{c.address}</span>
                  </div>
                )}

                {c.okvedMain && (
                  <div className="cc-card-row cc-card-detail">
                    <Briefcase size={12} />
                    <span>{c.okvedMain.code} — {c.okvedMain.name}</span>
                  </div>
                )}

                {c.authorizedCapital && (
                  <div className="cc-card-row cc-card-detail">
                    <Banknote size={12} />
                    <span>Уставный капитал: {c.authorizedCapital} ₽</span>
                  </div>
                )}

                {c.financials && (c.financials.revenue !== undefined || c.financials.employees !== undefined) && (
                  <div className="cc-card-row cc-card-fin">
                    {c.financials.revenue !== undefined && (
                      <span>Выручка {formatMoney(c.financials.revenue)} ₽{c.financials.year ? ` (${c.financials.year})` : ''}</span>
                    )}
                    {c.financials.netProfit !== undefined && (
                      <span>Прибыль {formatMoney(c.financials.netProfit)} ₽</span>
                    )}
                    {c.financials.employees !== undefined && (
                      <span>{c.financials.employees} сотр.</span>
                    )}
                  </div>
                )}

                {c.legalForm && (
                  <div className="cc-card-row cc-card-detail cc-card-legal">
                    <span>{c.legalForm}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="cc-footer">
        <Building2 size={10} />
        Данные ФНС РФ (ЕГРЮЛ/ЕГРИП) · могут устаревать
      </div>
    </div>
  )
}
