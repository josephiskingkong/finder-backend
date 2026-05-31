import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ArrowRight, Shield, Scale, Rocket } from 'lucide-react'
import './Auth.css'

const questions = [
  {
    question: 'Какую стратегию в бизнесе вы предпочитаете?',
    options: [
      { icon: <Shield size={18} />, label: 'Консервативную, не люблю рисковать', value: 'conservative' },
      { icon: <Scale size={18} />, label: 'Сбалансированную, готов к рискам', value: 'balanced' },
      { icon: <Rocket size={18} />, label: 'Агрессивная, люблю рисковать', value: 'aggressive' },
    ],
  },
  {
    question: 'Какой у вас опыт в бизнесе?',
    options: [
      { icon: <Shield size={18} />, label: 'Нет опыта, только начинаю', value: 'beginner' },
      { icon: <Scale size={18} />, label: 'Есть небольшой опыт', value: 'intermediate' },
      { icon: <Rocket size={18} />, label: 'Опытный предприниматель', value: 'expert' },
    ],
  },
  {
    question: 'Какой бюджет вы готовы вложить?',
    options: [
      { icon: <Shield size={18} />, label: 'Минимальный, до 100 тыс.', value: 'low' },
      { icon: <Scale size={18} />, label: 'Средний, 100–500 тыс.', value: 'medium' },
      { icon: <Rocket size={18} />, label: 'Большой, от 500 тыс.', value: 'high' },
    ],
  },
]

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Финальный шаг — форма регистрации
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')

  const currentAnswer = answers[step] || ''

  const selectOption = (value: string) => {
    const updated = [...answers]
    updated[step] = value
    setAnswers(updated)
  }

  const handleNext = () => {
    if (!currentAnswer) return
    if (step < questions.length - 1) {
      setStep(step + 1)
    } else {
      setStep(questions.length) // переход к форме
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(email, password, firstName || undefined)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  const isQuizStep = step < questions.length
  const q = isQuizStep ? questions[step] : null

  return (
    <div className="auth-page">
      <div className="auth-bg-texture" />
      <div className="auth-glow" />

      <div className="auth-logo-top">FOUNDER</div>

      {isQuizStep && q ? (
        <div className="quiz-card">
          <div className="quiz-step-badge">Вопрос {step + 1} из {questions.length}</div>
          <h2 className="quiz-question">{q.question}</h2>
          <div className="quiz-options">
            {q.options.map(opt => (
              <button
                key={opt.value}
                className={`quiz-option ${currentAnswer === opt.value ? 'selected' : ''}`}
                onClick={() => selectOption(opt.value)}
              >
                <span className="quiz-option-icon">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary quiz-next-btn"
            onClick={handleNext}
            disabled={!currentAnswer}
          >
            Далее <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="auth-card">
          <h1 className="auth-title">Создать аккаунт</h1>
          <p className="auth-subtitle">Начни свой бизнес-путь с ИИ-наставником</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="auth-error">{error}</div>}

            <div className="field">
              <label className="label">Имя</label>
              <input
                className="input"
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Как к вам обращаться?"
              />
            </div>

            <div className="field">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="field">
              <label className="label">Пароль</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                required
                minLength={8}
              />
            </div>

            <button className="btn btn-primary auth-btn" type="submit" disabled={loading}>
              {loading ? 'Создание...' : 'Создать аккаунт'}
            </button>
          </form>
        </div>
      )}

      <p className="auth-footer">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </div>
  )
}
