import { useState, useEffect, useRef, FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, streamMessage } from '../api/client'
import ReactMarkdown from 'react-markdown'
import { Send, Bot, User, Loader2, ChevronDown } from 'lucide-react'
import './Chat.css'

interface Message {
  id: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  content: string
  createdAt: string
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

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const businessId = searchParams.get('businessId') || ''

  const [businesses, setBusinesses] = useState<BusinessItem[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const streamTextRef = useRef('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  // Загрузить список проектов
  useEffect(() => {
    api.get<BusinessItem[]>('/businesses').then(setBusinesses).catch(() => {})
  }, [])

  // Загрузить беседы
  useEffect(() => {
    if (!businessId) return
    api.get<Conversation[]>(`/chat/business/${businessId}/conversations`)
      .then(convs => {
        setConversations(convs)
        if (convs.length > 0) {
          setActiveConvId(convs[0].id)
        }
      })
      .catch(() => {})
  }, [businessId])

  // Загрузить сообщения беседы
  useEffect(() => {
    if (!activeConvId) {
      setMessages([])
      return
    }
    api.get<Message[]>(`/chat/conversations/${activeConvId}/messages`)
      .then(setMessages)
      .catch(() => {})
  }, [activeConvId])

  // Скролл вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const selectProject = (id: string) => {
    setSearchParams({ businessId: id })
    setActiveConvId(null)
    setMessages([])
    setConversations([])
    setShowProjectPicker(false)
  }

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || streaming || !businessId || input.trim().length > 2000) return

    const userMsg = input.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content: userMsg,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    setStreaming(true)
    setStreamText('')
    streamTextRef.current = ''

    streamMessage(
      {
        content: userMsg,
        businessId,
        conversationId: activeConvId || undefined,
        stream: true,
      },
      (chunk) => {
        streamTextRef.current += chunk
        setStreamText(streamTextRef.current)
      },
      () => {
        const finalText = streamTextRef.current
        setMessages(msgs => [
          ...msgs,
          {
            id: `ai-${Date.now()}`,
            role: 'ASSISTANT',
            content: finalText,
            createdAt: new Date().toISOString(),
          },
        ])
        setStreamText('')
        streamTextRef.current = ''
        setStreaming(false)

        // Обновить список бесед
        api.get<Conversation[]>(`/chat/business/${businessId}/conversations`)
          .then(convs => {
            setConversations(convs)
            if (!activeConvId && convs.length > 0) setActiveConvId(convs[0].id)
          })
          .catch(() => {})
      },
    )
  }

  const currentProject = businesses.find(b => b.id === businessId)

  return (
    <div className="chat-page">
      {/* Список бесед */}
      <div className="chat-convs">
        <div className="chat-convs-header">
          {/* Выбор проекта */}
          <div className="project-picker-wrapper">
            <button className="project-picker-btn" onClick={() => setShowProjectPicker(p => !p)}>
              <span>{currentProject?.title || 'Выберите проект'}</span>
              <ChevronDown size={14} />
            </button>
            {showProjectPicker && (
              <div className="project-picker-dropdown">
                {businesses.length === 0 ? (
                  <div className="picker-empty">Нет проектов</div>
                ) : (
                  businesses.map(b => (
                    <button
                      key={b.id}
                      className={`picker-item ${b.id === businessId ? 'active' : ''}`}
                      onClick={() => selectProject(b.id)}
                    >
                      {b.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <button
          className="btn btn-secondary new-conv-btn"
          onClick={() => { setActiveConvId(null); setMessages([]) }}
          disabled={!businessId}
        >
          + Новая беседа
        </button>
        <div className="conv-list">
          {conversations.map(c => (
            <button
              key={c.id}
              className={`conv-item ${c.id === activeConvId ? 'active' : ''}`}
              onClick={() => setActiveConvId(c.id)}
            >
              {c.title || 'Без названия'}
            </button>
          ))}
        </div>
      </div>

      {/* Область чата */}
      <div className="chat-area">
        {!businessId ? (
          <div className="chat-empty">
            <Bot size={48} strokeWidth={1.2} />
            <h2>Выберите проект</h2>
            <p>Выберите проект в панели слева или перейдите в «Проекты» и создайте новый</p>
          </div>
        ) : messages.length === 0 && !streamText ? (
          <div className="chat-empty">
            <Bot size={48} strokeWidth={1.2} />
            <h2>Начните диалог</h2>
            <p>Расскажите о своей бизнес-идее или попросите ИИ помочь её найти</p>
            <div className="chat-hints">
              <button className="hint-chip" onClick={() => setInput('У меня есть бизнес-идея, хочу её проработать')}>
                У меня есть идея
              </button>
              <button className="hint-chip" onClick={() => setInput('Помоги мне придумать бизнес-идею')}>
                Помоги найти идею
              </button>
              <button className="hint-chip" onClick={() => setInput('Хочу зарегистрировать ИП, с чего начать?')}>
                Регистрация ИП
              </button>
            </div>
          </div>
        ) : (
          <div className="messages-container">
            <div className="messages-list">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.role === 'USER' ? 'user' : 'assistant'}`}>
                  <div className="message-icon">
                    {msg.role === 'USER'
                      ? <User size={16} />
                      : <Bot size={16} />
                    }
                  </div>
                  <div className="message-content">
                    {msg.role === 'ASSISTANT' ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      msg.content.split('\n').map((line, i) => (
                        <p key={i}>{line || '\u00A0'}</p>
                      ))
                    )}
                  </div>
                </div>
              ))}

              {/* Стриминговое сообщение */}
              {streaming && streamText && (
                <div className="message assistant">
                  <div className="message-icon"><Bot size={16} /></div>
                  <div className="message-content">
                    <ReactMarkdown>{streamText}</ReactMarkdown>
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

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Ввод */}
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
                placeholder="Напишите сообщение..."
                rows={1}
                disabled={streaming}
              />
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
            <p className="chat-disclaimer">ИИ может допускать ошибки. Проверяйте важную информацию.</p>
          </form>
        )}
      </div>
    </div>
  )
}
