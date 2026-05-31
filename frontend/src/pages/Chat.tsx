import { useState, useEffect, useRef, FormEvent } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api, streamMessage } from '../api/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Bot, User, Loader2, ArrowLeft, Sparkles, Lock } from 'lucide-react'
import CompetitorCard, { CompetitorAnalysisResult } from '../components/CompetitorCard'
import { useAuth } from '../context/AuthContext'
import './Chat.css'

interface MessageMetadata {
  tokensIn?: number
  tokensOut?: number
  aiTier?: string
  usedSummary?: boolean
  competitorsAttached?: boolean
  competitorsResult?: CompetitorAnalysisResult
}

interface Message {
  id: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  content: string
  createdAt: string
  metadata?: string | null
  competitors?: CompetitorAnalysisResult | null
}

interface Conversation {
  id: string
  title?: string
  messages?: Message[]
}

interface BusinessItem {
  id: string
  title: string
}

type AiTier = 'PLUS' | 'PREMIUM'

interface AiTierInfo {
  id: AiTier
  label: string
  model: string
  provider: string
  badge: string
  description: string
  enabled: boolean
}

interface ModelsResponse {
  default: AiTier
  subscription: { plan: 'FREE' | 'PLUS' | 'PREMIUM'; until: string | null; isActive: boolean; limit: number; windowHours: number }
  tiers: AiTierInfo[]
}

interface UsageResponse {
  plan: 'FREE' | 'PLUS' | 'PREMIUM'
  used: number
  limit: number
  windowHours: number
  remaining: number
  resetAt: string | null
}

function parseMetadata(raw?: string | null): MessageMetadata | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export default function Chat() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const businessId = searchParams.get('businessId') || ''

  const [businesses, setBusinesses] = useState<BusinessItem[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamError, setStreamError] = useState('')
  const [tiers, setTiers] = useState<AiTierInfo[]>([])
  const [selectedTier, setSelectedTier] = useState<AiTier | null>(null)
  const [tierMenuOpen, setTierMenuOpen] = useState(false)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [quotaInfo, setQuotaInfo] = useState<{ msg: string; minutes: number; plan: string } | null>(null)
  const pendingCompetitorsMsgId = useRef<string | null>(null)
  const streamTextRef = useRef('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRafRef = useRef<number | null>(null)

  const COMPETITOR_PATTERN = /(конкурент|конкуренц|анализ\s+рынка|анализ\s+конкур|спарси|проверь\s+конкур|кто\s+уже\s+на\s+рынке|кто\s+есть\s+на\s+рынке|похожие\s+(компании|бизнес)|данн(ые|ых)\s+(из\s+)?(ЕГРЮЛ|ЕГРИП|ФНС))/i

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const refreshUsage = () => {
    api.get<UsageResponse>('/ai/usage').then(setUsage).catch(() => {})
  }

  useEffect(() => {
    api.get<BusinessItem[]>('/businesses').then(setBusinesses).catch(() => {})
    api.get<ModelsResponse>('/ai/models')
      .then(res => {
        setTiers(res.tiers)
        const saved = localStorage.getItem('selectedAiTier') as AiTier | null
        const available = res.tiers.filter((t: AiTierInfo) => t.enabled).map((t: AiTierInfo) => t.id)
        if (saved && available.includes(saved)) {
          setSelectedTier(saved)
        } else {
          setSelectedTier(res.default)
        }
      })
      .catch(() => {})
    refreshUsage()
  }, [])

  const conversationIdFromUrl = searchParams.get('conversationId')

  useEffect(() => {
    if (!businessId) return
    api.get<Conversation[]>(`/chat/business/${businessId}/conversations`)
      .then(convs => {
        setConversations(convs)
        // Используем conversationId из URL, или первый чат, или null
        if (conversationIdFromUrl) {
          const exists = convs.find(c => c.id === conversationIdFromUrl)
          setActiveConvId(exists ? conversationIdFromUrl : (convs[0]?.id || null))
        } else if (convs.length > 0) {
          setActiveConvId(convs[0].id)
        }
      })
      .catch(() => {})
  }, [businessId, conversationIdFromUrl])

  useEffect(() => {
    if (!activeConvId) {
      setMessages([])
      return
    }
    api.get<Message[]>(`/chat/conversations/${activeConvId}/messages`)
      .then((msgs: Message[]) => setMessages(msgs.map((m: Message) => {
        if (m.role !== 'ASSISTANT' || !m.metadata) return m
        const meta = parseMetadata(m.metadata)
        if (!meta?.competitorsResult) return m
        return { ...m, competitors: meta.competitorsResult }
      })))
      .catch(() => {})
  }, [activeConvId])

  // Единый скролл: во время стриминга — тихий (без анимации) через rAF,
  // при новых сообщениях — мгновенный без дёрганья.
  useEffect(() => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    })
  }, [messages, streamText])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || streaming || !businessId || input.trim().length > 2000) return

    const userMsg = input.trim()
    const isCompetitorQuery = COMPETITOR_PATTERN.test(userMsg)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content: userMsg,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    if (isCompetitorQuery) {
      const cmpMsgId = `competitors-${Date.now()}`
      pendingCompetitorsMsgId.current = cmpMsgId
      setMessages(prev => [...prev, {
        id: cmpMsgId,
        role: 'ASSISTANT',
        content: '',
        createdAt: new Date().toISOString(),
        competitors: null,
      }])
    }

    setStreaming(true)
    setStreamText('')
    streamTextRef.current = ''

    setStreamError('')
    setQuotaInfo(null)
    streamMessage(
      {
        content: userMsg,
        businessId,
        conversationId: activeConvId || undefined,
        stream: true,
        ...(selectedTier ? { aiTier: selectedTier } : {}),
      },
      (chunk) => {
        streamTextRef.current += chunk
        setStreamText(streamTextRef.current)
      },
      (err, meta) => {
        const finalText = streamTextRef.current
        // 429 — лимит исчерпан. Откатываем оптимистичное сообщение юзера и показываем CTA.
        if (meta?.code === 'MESSAGE_QUOTA_EXCEEDED') {
          setMessages(msgs => msgs.filter(m => m.id !== tempUserMsg.id))
          setInput(userMsg)
          setQuotaInfo({
            msg: err || 'Лимит исчерпан',
            minutes: meta.minutesUntilReset ?? 0,
            plan: meta.plan ?? 'FREE',
          })
          setStreamText('')
          streamTextRef.current = ''
          setStreaming(false)
          return
        }
        if (finalText) {
          const cmpId = pendingCompetitorsMsgId.current
          if (cmpId) {
            // Вставляем текст ИИ в то же сообщение, где карточка конкурентов
            setMessages(msgs => msgs.map(m =>
              m.id === cmpId ? { ...m, content: finalText } : m
            ))
          } else {
            setMessages(msgs => [
              ...msgs,
              {
                id: `ai-${Date.now()}`,
                role: 'ASSISTANT',
                content: finalText,
                createdAt: new Date().toISOString(),
              },
            ])
          }
        }
        if (err) setStreamError(err)
        pendingCompetitorsMsgId.current = null
        setStreamText('')
        streamTextRef.current = ''
        setStreaming(false)

        api.get<Conversation[]>(`/chat/business/${businessId}/conversations`)
          .then(convs => {
            setConversations(convs)
            if (!activeConvId && convs.length > 0) setActiveConvId(convs[0].id)
          })
          .catch(() => {})
        refreshUsage()
      },
      (competitorsData) => {
        const cmpMsgId = pendingCompetitorsMsgId.current
        if (!cmpMsgId) return
        // НЕ обнуляем pendingCompetitorsMsgId — он нужен в onDone для слияния текста ИИ
        setMessages(prev => prev.map(m =>
          m.id === cmpMsgId
            ? { ...m, competitors: competitorsData as CompetitorAnalysisResult }
            : m
        ))
      },
    )
  }

  const currentTier = tiers.find(t => t.id === selectedTier)

  const currentProject = businesses.find(b => b.id === businessId)

  const goToProjects = () => {
    navigate('/dashboard')
  }

  return (
    <div className="chat-page">
      {/* Header */}
      <div className="chat-header">
        <ArrowLeft size={18} className="chat-back-icon" onClick={goToProjects} />
        <span className="chat-header-title">{currentProject?.title || 'Выберите проект'}</span>
      </div>

      <div className="chat-area">
        {!businessId ? (
          <div className="chat-empty">
            <div className="chat-empty-card">
              <div className="chat-empty-logo">FOUNDER</div>
              <h2>Выберите проект</h2>
              <p>Выберите проект в боковой панели, чтобы начать работу</p>
            </div>
          </div>
        ) : messages.length === 0 && !streamText ? (
          <div className="chat-empty">
            <div className="chat-empty-card">
              <div className="chat-empty-logo">FOUNDER</div>
              <h2>Над чем работаем сегодня?</h2>
              <p>Напишите первое сообщение в чат, чтобы начать работать над новой идеей</p>
            </div>
          </div>
        ) : (
          <div className="messages-container">
            <div className="messages-list">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.role === 'USER' ? 'user' : 'assistant'}${Object.prototype.hasOwnProperty.call(msg, 'competitors') ? ' competitor-msg' : ''}`}>
                  <div className="message-icon">
                    {msg.role === 'USER'
                      ? <User size={16} />
                      : <Bot size={16} />
                    }
                  </div>
                  <div className="message-content">
                    {Object.prototype.hasOwnProperty.call(msg, 'competitors') ? (
                      <>
                        <CompetitorCard
                          result={msg.competitors ?? { businessId, generatedAt: '', totalCandidates: 0, foundCount: 0, items: [], summaryMarkdown: '' }}
                          loading={msg.competitors === null}
                          tier={selectedTier || undefined}
                        />
                        {msg.content && <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>}
                      </>
                    ) : msg.role === 'ASSISTANT' ? (
                      <>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        {isAdmin && (() => {
                          const meta = parseMetadata(msg.metadata)
                          if (!meta?.tokensIn && !meta?.tokensOut) return null
                          return (
                            <div className="msg-token-stats">
                              <span title="Входящие токены (контекст)">↑ {meta.tokensIn ?? '?'}</span>
                              <span title="Исходящие токены (ответ)">↓ {meta.tokensOut ?? '?'}</span>
                              {meta.aiTier && <span className="msg-token-tier">{meta.aiTier}</span>}
                            </div>
                          )
                        })()}
                      </>
                    ) : (
                      msg.content.split('\n').map((line, i) => (
                        <p key={i}>{line || '\u00A0'}</p>
                      ))
                    )}
                  </div>
                </div>
              ))}

              {streaming && streamText && (
                <div className="message assistant">
                  <div className="message-icon"><Bot size={16} /></div>
                  <div className="message-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
                    <span className="typing-cursor" />
                  </div>
                </div>
              )}

              {streaming && !streamText && (
                <div className="message assistant">
                  <div className="message-icon"><Bot size={16} /></div>
                  <div className="message-content thinking">
                    <Loader2 size={16} className="spin" />
                    <span>Думаю...</span>
                  </div>
                </div>
              )}

              {streamError && (
                <div className="chat-error">{streamError}</div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Quota banner (поверх инпута) */}
        {businessId && quotaInfo && (
          <div className="quota-banner">
            <div className="quota-banner-text">
              <strong>Лимит сообщений исчерпан.</strong> {quotaInfo.msg}
            </div>
            {quotaInfo.plan !== 'PREMIUM' && (
              <a className="quota-banner-cta" href="/admin/billing">Повысить тариф →</a>
            )}
          </div>
        )}

        {/* Input */}
        {businessId && (
          <form className="chat-input-area" onSubmit={handleSend}>
            <div className="chat-input-wrap">
              <textarea
                className="chat-input"
                ref={textareaRef}
                value={input}
                maxLength={2000}
                onChange={e => {
                  setInput(e.target.value)
                  autoResize()
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend(e)
                  }
                }}
                placeholder="Начните писать здесь"
                rows={1}
                disabled={streaming}
              />
              <div className="chat-input-actions">
                {tiers.length > 0 && (
                  <div className="tier-selector">
                    <button
                      type="button"
                      className="tier-btn"
                      onClick={() => setTierMenuOpen(v => !v)}
                      title={currentTier?.description}
                    >
                      <Sparkles size={14} />
                      <span>{currentTier?.label || 'Модель'}</span>
                    </button>
                    {tierMenuOpen && (
                      <>
                        <div className="tier-menu-backdrop" onClick={() => setTierMenuOpen(false)} />
                        <div className="tier-menu">
                          {tiers.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              className={`tier-item ${t.id === selectedTier ? 'active' : ''} ${!t.enabled ? 'disabled' : ''}`}
                              disabled={!t.enabled}
                              onClick={() => {
                                if (!t.enabled) return
                                setSelectedTier(t.id)
                                localStorage.setItem('selectedAiTier', t.id)
                                setTierMenuOpen(false)
                              }}
                            >
                              <div className="tier-item-head">
                                <span className="tier-item-label">{t.label}</span>
                                {!t.enabled && <Lock size={12} />}
                              </div>
                              <span className="tier-item-desc">{t.description}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {input.length > 1800 && (
                  <span className="char-counter">{input.length}/2000</span>
                )}
                <button
                  className="send-btn"
                  type="submit"
                  disabled={!input.trim() || streaming}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
