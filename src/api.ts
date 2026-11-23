const API_URL = ''

export type ApiUser = {
  id: string
  email: string
  displayName: string
}

export type ApiChat = {
  id: string
  name: string
  created_at: string
  direct?: boolean
}

export type ApiMessage = {
  id: string
  chat_id: string
  sender_id: string
  sender_name?: string
  text: string
  created_at: string
}

async function request<T>(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('relay.token')
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail ?? 'Request failed')
  return body as T
}

export const api = {
  searchUsers: (query: string) =>
    request<ApiUser[]>(`/api/users/search?q=${encodeURIComponent(query)}`),
  createDirectChat: (userId: string) =>
    request<ApiChat>(`/api/chats/direct/${userId}`, { method: 'POST' }),
  register: (email: string, password: string, displayName: string) =>
    request<{ token: string; user: ApiUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: ApiUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<ApiUser>('/api/auth/me'),
  chats: () => request<ApiChat[]>('/api/chats'),
  createChat: (name: string) =>
    request<ApiChat>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteChat: (chatId: string) =>
    request<{ deleted: boolean }>(`/api/chats/${chatId}`, {
      method: 'DELETE',
    }),
  messages: (chatId: string) =>
    request<ApiMessage[]>(`/api/chats/${chatId}/messages`),
  sendMessage: (chatId: string, text: string) =>
    request<ApiMessage>(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
}
