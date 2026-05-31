import { useEffect, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import './Pricing.css'

type Plan = 'FREE' | 'PLUS' | 'PREMIUM'

interface PlanLimit {
  messagesPerWindow: number
  windowHours: number
}

interface ModelsResponse {
  subscription: { plan: Plan; until: string | null; isActive: boolean }
  planLimits: Record<Plan, PlanLimit>
}

interface PlanCard {
  id: Plan
  title: string
  price: string
  priceNote: string
  description: string
  accent: string
  features: string[]
}

const PLAN_DEFS: PlanCard[] = [
  {
    id: 'FREE',
    title: 'Free',
    price: '0 ₽',
    priceNote: 'навсегда',
    description: 'Чтобы попробовать сервис и понять, подходит ли он вам.',
    accent: 'plan-card-free',
    features: [
      'Стандартный режим ИИ-наставника',
      'Базовый роадмап',
      'Один проект',
    ],
  },
  {
    id: 'PLUS',
    title: 'Plus',
    price: '499 ₽',
    priceNote: 'в месяц',
    description: 'Для активного предпринимателя, который пользуется чатом каждый день.',
    accent: 'plan-card-plus',
    features: [
      'Стандартный режим без существенных ограничений',
      'Несколько проектов',
      'Расширенный роадмап',
      'Поддержка по почте',
    ],
  },
  {
    id: 'PREMIUM',
    title: 'Premium',
    price: '1 299 ₽',
    priceNote: 'в месяц',
    description: 'Максимум возможностей: глубокие ответы, конкуренты и приоритет.',
    accent: 'plan-card-premium',
    features: [
      'Расширенный режим ИИ',
      'Анализ конкурентов через ЕГРЮЛ/ЕГРИП',
      'Приоритетная очередь обработки',
      'Премиум-поддержка',
    ],
  },
]

export default function Pricing() {
  const { user } = useAuth()
  const [limits, setLimits] = useState<Record<Plan, PlanLimit> | null>(null)

  useEffect(() => {
    api.get<ModelsResponse>('/ai/models')
      .then(res => setLimits(res.planLimits))
      .catch(() => {})
  }, [])

  const currentPlan: Plan = user?.subscription || 'FREE'

  return (
    <div className="pricing-page">
      <header className="pricing-header">
        <h1>Тарифы и подписка</h1>
        <p>Выберите план, который подходит под ваши задачи. Подписку можно сменить в любой момент.</p>
      </header>

      <div className="pricing-grid">
        {PLAN_DEFS.map(plan => {
          const limit = limits?.[plan.id]
          const isCurrent = plan.id === currentPlan
          return (
            <div key={plan.id} className={`plan-card ${plan.accent} ${isCurrent ? 'is-current' : ''}`}>
              {isCurrent && <span className="current-pill"><Sparkles size={12} /> Ваш текущий план</span>}
              <h2 className="plan-card-title">{plan.title}</h2>
              <div className="plan-card-price">
                <span className="price">{plan.price}</span>
                <span className="price-note">{plan.priceNote}</span>
              </div>
              <p className="plan-card-desc">{plan.description}</p>

              <ul className="plan-card-features">
                {limit && (
                  <li>
                    <Check size={14} />
                    <span><strong>{limit.messagesPerWindow}</strong> сообщений за {limit.windowHours} ч</span>
                  </li>
                )}
                {plan.features.map((f, i) => (
                  <li key={i}>
                    <Check size={14} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                className="plan-card-cta"
                disabled={isCurrent}
                title={isCurrent ? 'Это ваш текущий план' : 'Оформление подписки скоро будет доступно'}
              >
                {isCurrent ? 'Текущий план' : 'Оформить'}
              </button>
            </div>
          )
        })}
      </div>

      <p className="pricing-foot">
        Платёжная система подключается. Если нужно сменить тариф вручную — напишите в поддержку.
      </p>
    </div>
  )
}
