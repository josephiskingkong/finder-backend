import { useSearchParams } from 'react-router-dom'
import { Box } from 'lucide-react'
import './Mvp.css'

export default function MvpPage() {
  const [searchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''

  if (!businessId) {
    return (
      <div className="mvp-page">
        <div className="mvp-empty">
          <Box size={40} strokeWidth={1.2} />
          <h2>Выберите проект</h2>
          <p>Выберите бизнес-проект в боковой панели, чтобы начать работу над MVP</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mvp-page">
      <div className="mvp-card">
        <div className="mvp-icon-wrap">
          <Box size={32} />
        </div>
        <h2 className="mvp-title">MVP</h2>
        <p className="mvp-desc">
          Этот раздел поможет вам спланировать и создать минимально жизнеспособный продукт.
          Обсудите с ИИ-наставником в чате, что должно войти в первую версию вашего продукта.
        </p>
        <div className="mvp-steps">
          <div className="mvp-step">
            <span className="mvp-step-num">1</span>
            <span>Определите ключевую функцию</span>
          </div>
          <div className="mvp-step">
            <span className="mvp-step-num">2</span>
            <span>Опишите пользовательский сценарий</span>
          </div>
          <div className="mvp-step">
            <span className="mvp-step-num">3</span>
            <span>Выберите технологический стек</span>
          </div>
          <div className="mvp-step">
            <span className="mvp-step-num">4</span>
            <span>Создайте прототип и протестируйте</span>
          </div>
        </div>
      </div>
    </div>
  )
}
