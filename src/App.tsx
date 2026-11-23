import { FormEvent, useEffect, useMemo, useState } from 'react'
import { api, ApiChat, ApiMessage, ApiUser } from './api'

type Chat = ApiChat & {
  initials: string
  color: string
  preview: string
  time: string
  unread?: number
  members: number
}

type Message = ApiMessage & {
  own: boolean
  senderName: string
  senderInitials: string
  time: string
}

function Icon({ name }: { name: 'search' | 'plus' | 'send' | 'smile' | 'paperclip' | 'dots' | 'phone' | 'video' | 'trash' }) {
  const paths = {
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 4 4',
    plus: 'M12 5v14M5 12h14',
    send: 'm22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',
    smile: 'M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
    paperclip: 'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
    dots: 'M5 12h.01M12 12h.01M19 12h.01',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z',
    video: 'm22 8-6 4 6 4V8ZM14 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5',
  }
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"><path d={paths[name]} /></svg>
}

function decorateChat(chat: ApiChat): Chat {
  return {
    ...chat,
    initials: chat.name.slice(0, 2).toUpperCase(),
    color: ['coral', 'blue', 'violet', 'green'][chat.id.charCodeAt(0) % 4],
    preview: 'No messages yet',
    time: 'Now',
    members: 1,
  }
}

export function App() {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authError, setAuthError] = useState('')
  const [currentAccount, setCurrentAccount] = useState<ApiUser | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChat, setActiveChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState('')
  const [search, setSearch] = useState('')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [people, setPeople] = useState<ApiUser[]>([])
  const [deleteCandidate, setDeleteCandidate] = useState<Chat | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('relay.token')
    if (!token) return
    api.me()
      .then((user) => {
        setCurrentAccount(user)
        loadChats()
      })
      .catch(() => localStorage.removeItem('relay.token'))
  }, [])

  useEffect(() => {
    if (!activeChat || !currentAccount) return
    let disposed = false
    const loadMessages = () => {
      api.messages(activeChat.id)
        .then((items) => {
          if (!disposed) setMessages(items.map((item) => decorateMessage(item, currentAccount)))
        })
        .catch((error: Error) => {
          if (!disposed) setAuthError(error.message)
        })
    }
    loadMessages()
    const interval = window.setInterval(loadMessages, 3000)
    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [activeChat, currentAccount])

  function decorateMessage(item: ApiMessage, user: ApiUser): Message {
    const own = item.sender_id === user.id
    const date = new Date(item.created_at)
    return {
      ...item,
      own,
      senderName: own ? 'You' : (item.sender_name ?? 'User'),
      senderInitials: own ? 'YO' : (item.sender_name?.slice(0, 2).toUpperCase() ?? 'US'),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  }

  async function loadChats() {
    try {
      const items = await api.chats()
      const decorated = items.map(decorateChat)
      setChats(decorated)
      setActiveChat((current) => current ?? decorated[0] ?? null)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to load chats')
    }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault()
    setAuthError('')
    if (password.length < 8) {
      setAuthError('Пароль должен содержать минимум 8 символов.')
      return
    }
    if (authMode === 'register' && displayName.trim().length < 2) {
      setAuthError('Введите имя пользователя.')
      return
    }
    try {
      const result = authMode === 'login'
        ? await api.login(email.trim(), password)
        : await api.register(email.trim(), password, displayName.trim())
      localStorage.setItem('relay.token', result.token)
      setCurrentAccount(result.user)
      await loadChats()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed')
    }
  }

  function logout() {
    localStorage.removeItem('relay.token')
    setCurrentAccount(null)
    setChats([])
    setActiveChat(null)
    setMessages([])
  }

  async function searchPeople(query: string) {
    setPeopleQuery(query)
    try {
      setPeople(await api.searchUsers(query))
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to search users')
    }
  }

  async function openDirectChat(person: ApiUser) {
    try {
      const chat = decorateChat(await api.createDirectChat(person.id))
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)])
      setActiveChat(chat)
      setPeopleOpen(false)
      setPeopleQuery('')
      setPeople([])
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to open chat')
    }
  }

  async function createConversation() {
    const name = window.prompt('Название группы')
    if (!name?.trim()) return
    try {
      const chat = decorateChat(await api.createChat(name.trim()))
      setChats((current) => [chat, ...current])
      setActiveChat(chat)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create chat')
    }
  }

  async function deleteActiveChat() {
    if (!activeChat) return
    setDeleteCandidate(activeChat)
  }

  async function confirmDeleteChat() {
    if (!deleteCandidate) return
    try {
      await api.deleteChat(deleteCandidate.id)
      setChats((current) => {
        const remaining = current.filter((chat) => chat.id !== deleteCandidate.id)
        setActiveChat(remaining[0] ?? null)
        return remaining
      })
      setMessages([])
      setAuthError('')
      setDeleteCandidate(null)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to delete chat')
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const text = messageText.trim()
    if (!text || !activeChat || !currentAccount) return
    try {
      const item = await api.sendMessage(activeChat.id, text)
      setMessages((current) => [...current, decorateMessage(item, currentAccount)])
      setChats((current) => current.map((chat) => chat.id === activeChat.id
        ? { ...chat, preview: `You: ${text}`, time: 'Now' }
        : chat))
      setMessageText('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send message')
    }
  }

  const visibleChats = useMemo(
    () => chats.filter((chat) => chat.name.toLowerCase().includes(search.toLowerCase())),
    [chats, search],
  )

  if (!currentAccount) {
    return (
      <main className="auth-page">
        <form className="auth-card" onSubmit={submitAuth}>
          <div className="brand-mark">R</div>
          <h1>{authMode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</h1>
          <p>{authMode === 'login' ? 'Войдите, чтобы открыть свои чаты.' : 'Зарегистрируйтесь для начала общения.'}</p>
          {authMode === 'register' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Имя пользователя" required />}
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль (минимум 8 символов)" required />
          {authError && <div className="auth-error">{authError}</div>}
          <button className="auth-submit" type="submit">{authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
          <button className="auth-switch" type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError('') }}>
            {authMode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark">R</div><span>relay</span><button className="icon-button compose-button" aria-label="Найти пользователя" onClick={() => { setPeopleOpen(true); searchPeople('') }}><Icon name="plus" /></button></div>
        <label className="search-box"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /><kbd>Ctrl K</kbd></label>
        <div className="section-label"><span>Conversations</span><button className="small-action" aria-label="Найти пользователя" onClick={() => { setPeopleOpen(true); searchPeople('') }}><Icon name="plus" /></button></div>
        <nav className="chat-list" aria-label="Conversations">
          {visibleChats.map((chat) => (
            <div
              className={`chat-item ${chat.id === activeChat?.id ? 'active' : ''}`}
              key={chat.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveChat(chat)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setActiveChat(chat)
              }}
            >
              <div className={`avatar ${chat.color}`}>{chat.initials}</div>
              <div className="chat-details"><div className="chat-title"><strong>{chat.name}</strong><span>{chat.time}</span></div><div className="chat-preview"><span>{chat.preview}</span>{chat.unread && <b>{chat.unread}</b>}</div></div>
              <button
                type="button"
                className="chat-delete-button"
                aria-label={`Удалить чат ${chat.name}`}
                title="Удалить чат"
                onClick={(event) => {
                  event.stopPropagation()
                  setDeleteCandidate(chat)
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer"><button className="profile-card" type="button" onClick={logout}><div className="avatar profile">{currentAccount.displayName.slice(0, 2).toUpperCase()}</div><span><strong>{currentAccount.displayName}</strong><small>Выйти из аккаунта</small></span><Icon name="dots" /></button></div>
      </aside>
      <section className="conversation">
        <header className="conversation-header">
          <div className="conversation-identity"><div className={`avatar ${activeChat?.color ?? 'blue'}`}>{activeChat?.initials ?? '+'}</div><div><h1>{activeChat?.name ?? 'Выберите чат'}</h1><span>{activeChat ? <><i className="online-dot" /> {activeChat.members} members</> : 'Нет активного разговора'}</span></div></div>
          <div className="header-actions"><button className="icon-button" aria-label="Audio call"><Icon name="phone" /></button><button className="icon-button" aria-label="Video call"><Icon name="video" /></button><button className="icon-button delete-chat-button" aria-label="Удалить чат" title="Удалить чат" disabled={!activeChat} onClick={deleteActiveChat}><Icon name="dots" /></button></div>
        </header>
        <div className="message-area">
          <div className="date-divider"><span>Today</span></div>
          {!activeChat && <div className="empty-conversation"><strong>У вас пока нет чатов</strong><span>Нажмите «+», чтобы создать первый разговор.</span></div>}
          {messages.map((message) => <article className={`message-row ${message.own ? 'own' : ''}`} key={message.id}>{!message.own && <div className="avatar small-avatar blue">{message.senderInitials}</div>}<div className="message-content"><div className="message-meta"><strong>{message.senderName}</strong><time>{message.time}</time></div><div className="message-bubble">{message.text}</div></div></article>)}
        </div>
        <form className="composer" onSubmit={sendMessage}><button type="button" className="composer-action" aria-label="Attach file"><Icon name="paperclip" /></button><input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message..." aria-label="Message" /><button type="button" className="composer-action" aria-label="Add emoji"><Icon name="smile" /></button><button type="submit" className="send-button" aria-label="Send message"><Icon name="send" /></button></form>
      </section>
      {peopleOpen && (
        <div className="people-overlay" role="dialog" aria-modal="true" aria-label="Поиск пользователей">
          <div className="people-dialog">
            <div className="people-header">
              <h2>Найти пользователя</h2>
              <button type="button" onClick={() => setPeopleOpen(false)}>Закрыть</button>
            </div>
            <input
              autoFocus
              value={peopleQuery}
              onChange={(event) => searchPeople(event.target.value)}
              placeholder="Введите имя"
            />
            <div className="people-results">
              {people.map((person) => (
                <button type="button" key={person.id} onClick={() => openDirectChat(person)}>
                  <span className="avatar blue">{person.displayName.slice(0, 2).toUpperCase()}</span>
                  <span><strong>{person.displayName}</strong><small>{person.email}</small></span>
                  <b>Написать</b>
                </button>
              ))}
              {peopleQuery && people.length === 0 && <p>Пользователи не найдены</p>}
            </div>
          </div>
        </div>
      )}
      {deleteCandidate && (
        <div className="people-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title">
          <div className="delete-dialog">
            <div className="delete-dialog-icon"><Icon name="trash" /></div>
            <h2 id="delete-chat-title">Удалить чат?</h2>
            <p>Чат «{deleteCandidate.name}» исчезнет из вашего списка. Для собеседника переписка сохранится.</p>
            <div className="delete-dialog-actions">
              <button type="button" className="delete-cancel" onClick={() => setDeleteCandidate(null)}>Отмена</button>
              <button type="button" className="delete-confirm" onClick={confirmDeleteChat}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
