import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { Loader2 } from 'lucide-react'
import './Market.css'

interface Business {
  id: string
  title: string
  targetAudience?: string
  competitors?: string
  monetizationModel?: string
  description?: string
  uniqueValue?: string
}

type Tab = 'segmentation' | 'competitors' | 'monetization'

export default function MarketPage() {
  const [searchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('segmentation')

  useEffect(() => {
    if (!businessId) return
    setLoading(true)
    api.get<Business>(`/businesses/${businessId}`)
      .then(setBusiness)
      .catch(() => setBusiness(null))
      .finally(() => setLoading(false))
  }, [businessId])

  if (!businessId) {
    return (
      <div className="market-page">
        <div className="market-empty">
          <h2>Выберите проект</h2>
          <p>Выберите бизнес-проект в боковой панели, чтобы увидеть анализ рынка</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="market-page">
        <div className="market-empty">
          <Loader2 size={32} className="spin" />
        </div>
      </div>
    )
  }

  if (!business) {
    return (
      <div className="market-page">
        <div className="market-empty">
          <h2>Проект не найден</h2>
          <p>Не удалось загрузить данные проекта</p>
        </div>
      </div>
    )
  }

  const audienceSegments = parseSegments(business.targetAudience)
  const competitorList = parseList(business.competitors)
  const monetizationItems = parseList(business.monetizationModel)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'segmentation', label: 'Сегментация' },
    { key: 'competitors', label: 'Конкуренты' },
    { key: 'monetization', label: 'Монетизация' },
  ]

  return (
    <div className="market-page">
      <div className="market-card">
        {/* Tabs */}
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

        {/* Segmentation */}
        {activeTab === 'segmentation' && (
          <div className="market-segmentation">
            {audienceSegments.length === 0 ? (
              <div className="market-no-data">
                <p>Данных о сегментах пока нет. Обсудите целевую аудиторию в чате с ИИ.</p>
              </div>
            ) : (
              <div className="concentric-rings">
                {/* Outer ring */}
                <div className="ring ring-outer">
                  {audienceSegments.length > 0 && (
                    <div className="ring-label ring-label-top">
                      <span className="ring-segment-name">{audienceSegments[0]?.name}</span>
                      {audienceSegments[0]?.desc && (
                        <div className="ring-segment-desc">{audienceSegments[0].desc}</div>
                      )}
                    </div>
                  )}
                  {/* Middle ring */}
                  <div className="ring ring-middle">
                    {/* Inner ring */}
                    <div className="ring ring-inner">
                      {audienceSegments.length > 1 && (
                        <span className="ring-center-label">{audienceSegments[1]?.name}</span>
                      )}
                    </div>
                  </div>
                  {audienceSegments.length > 2 && (
                    <div className="ring-label ring-label-bottom">
                      <span className="ring-segment-name">{audienceSegments[2]?.name}</span>
                      {audienceSegments[2]?.desc && (
                        <div className="ring-segment-desc">{audienceSegments[2].desc}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Competitors */}
        {activeTab === 'competitors' && (
          <div className="market-list-section">
            {competitorList.length === 0 ? (
              <div className="market-no-data">
                <p>Данных о конкурентах пока нет. Обсудите конкурентов в чате с ИИ.</p>
              </div>
            ) : (
              <div className="market-items">
                {competitorList.map((item, i) => (
                  <div key={i} className="market-item">
                    <div className="market-item-num">{i + 1}</div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Monetization */}
        {activeTab === 'monetization' && (
          <div className="market-list-section">
            {monetizationItems.length === 0 ? (
              <div className="market-no-data">
                <p>Данных о монетизации пока нет. Обсудите модель монетизации в чате с ИИ.</p>
              </div>
            ) : (
              <div className="market-items">
                {monetizationItems.map((item, i) => (
                  <div key={i} className="market-item">
                    <div className="market-item-num">{i + 1}</div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function parseSegments(text?: string): { name: string; desc?: string }[] {
  if (!text) return []
  const lines = text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
  return lines.slice(0, 4).map(line => {
    const parts = line.split(/[-–:]/);
    return {
      name: parts[0]?.trim() || line,
      desc: parts.slice(1).join('-').trim() || undefined,
    }
  })
}

function parseList(text?: string): string[] {
  if (!text) return []
  return text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
}
