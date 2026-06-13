import { create } from 'zustand'
import api from '../api/client'

const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || null,
  admin: null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post('/api/auth/login', { username, password })
      const token = res.data.access_token
      localStorage.setItem('token', token)
      set({ token, loading: false })
      return true
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed'
      set({ error: msg, loading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, admin: null })
  },

  fetchMe: async () => {
    try {
      const res = await api.get('/api/auth/me')
      set({ admin: res.data })
    } catch {
      // token invalid
    }
  },
}))

export default useAuthStore
