import { useEffect, useState, useCallback } from 'react'
import {
  UserPlus, Lock, Unlock, Trash2, RefreshCw, KeyRound,
  ChevronDown, ChevronUp, Eye, EyeOff, AlertCircle
} from 'lucide-react'
import api from '../api/client'

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

function isExpiredSoon(d) {
  if (!d) return false
  const days = (new Date(d) - new Date()) / (1000 * 60 * 60 * 24)
  return days < 7
}

function QuotaBar({ used, total }) {
  if (!total || total === 0) return <span className="text-slate-400 text-xs">Unlimited</span>
  const pct = Math.min(100, (used / total) * 100)
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{formatBytes(used)}</span>
        <span>{formatBytes(total)}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    username: '', password: '', max_connections: 1,
    quota_gb: 0, expire_days: 30, note: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/users', form)
      onCreated()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const passStrength = (p) => {
    if (p.length < 6) return { label: 'Weak', color: 'bg-red-500' }
    if (p.length < 10) return { label: 'Fair', color: 'bg-amber-500' }
    return { label: 'Strong', color: 'bg-green-500' }
  }
  const strength = passStrength(form.password)

  return (
    <Modal title="Add SSH User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Username</label>
          <input
            type="text"
            pattern="[a-z][a-z0-9_]{2,31}"
            title="Lowercase, start with letter, 3-32 chars"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            placeholder="john_doe"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
              minLength={6}
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {form.password && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="h-1 flex-1 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${strength.color}`}
                  style={{ width: form.password.length < 6 ? '33%' : form.password.length < 10 ? '66%' : '100%' }} />
              </div>
              <span className="text-xs text-slate-400">{strength.label}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Max Connections</label>
            <input
              type="number" min={1} max={10}
              value={form.max_connections}
              onChange={(e) => setForm({ ...form, max_connections: parseInt(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Data Quota (GB, 0=∞)</label>
            <input
              type="number" min={0} step={0.5}
              value={form.quota_gb}
              onChange={(e) => setForm({ ...form, quota_gb: parseFloat(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Expiry Days (0=never)</label>
          <input
            type="number" min={0}
            value={form.expire_days}
            onChange={(e) => setForm({ ...form, expire_days: parseInt(e.target.value) })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Note (optional)</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Customer name, purpose..."
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {loading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ChangePassModal({ user, onClose }) {
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post(`/api/users/${user.id}/change-password`, { new_password: password })
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={`Change Password — ${user.username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="New password"
            required minLength={6}
          />
          <button type="button" onClick={() => setShowPass(!showPass)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">Password changed!</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function UserRow({ user, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [showChangePass, setShowChangePass] = useState(false)

  const handleLockToggle = async () => {
    try {
      if (user.is_active) {
        await api.post(`/api/users/${user.id}/lock`)
      } else {
        await api.post(`/api/users/${user.id}/unlock`)
      }
      onRefresh()
    } catch (err) {
      alert(err.response?.data?.detail || 'Action failed')
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    try {
      await api.delete(`/api/users/${user.id}`)
      onRefresh()
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed')
    }
  }

  const handleResetTraffic = async () => {
    if (!confirm(`Reset traffic for "${user.username}"?`)) return
    try {
      await api.post(`/api/users/${user.id}/reset-traffic`)
      onRefresh()
    } catch (err) {
      alert(err.response?.data?.detail || 'Reset failed')
    }
  }

  const expired = user.expire_date && new Date(user.expire_date) < new Date()
  const expireSoon = !expired && isExpiredSoon(user.expire_date)

  return (
    <>
      <tr
        className="hover:bg-slate-700/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-200">{user.username}</span>
            {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
          </div>
          {user.note && <div className="text-xs text-slate-500 mt-0.5">{user.note}</div>}
        </td>
        <td className="py-3 px-4">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            user.is_active ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {user.is_active ? 'Active' : 'Locked'}
          </span>
        </td>
        <td className="py-3 px-4">
          <span className={`text-sm ${expired ? 'text-red-400' : expireSoon ? 'text-amber-400' : 'text-slate-300'}`}>
            {user.expire_date ? formatDate(user.expire_date) : 'Never'}
          </span>
          {expired && <div className="text-xs text-red-400">Expired</div>}
          {expireSoon && !expired && <div className="text-xs text-amber-400">Expiring soon</div>}
        </td>
        <td className="py-3 px-4 min-w-[140px]">
          <QuotaBar used={user.used_bytes} total={user.quota_bytes} />
        </td>
        <td className="py-3 px-4 text-sm text-slate-300">
          <span className={user.active_sessions >= user.max_connections ? 'text-amber-400' : ''}>
            {user.active_sessions}/{user.max_connections}
          </span>
        </td>
        <td className="py-3 px-4 text-xs text-slate-500">
          {new Date(user.created_at).toLocaleDateString()}
        </td>
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button
              onClick={handleLockToggle}
              title={user.is_active ? 'Lock' : 'Unlock'}
              className={`p-1.5 rounded-lg transition-colors ${
                user.is_active
                  ? 'text-amber-400 hover:bg-amber-500/20'
                  : 'text-green-400 hover:bg-green-500/20'
              }`}
            >
              {user.is_active ? <Lock size={15} /> : <Unlock size={15} />}
            </button>
            <button
              onClick={() => setShowChangePass(true)}
              title="Change Password"
              className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <KeyRound size={15} />
            </button>
            <button
              onClick={handleResetTraffic}
              title="Reset Traffic"
              className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={handleDelete}
              title="Delete"
              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-700/20">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-slate-500 text-xs mb-1">RX / TX</div>
                <div className="text-slate-300">
                  ↓ {formatBytes(user.rx_bytes)} / ↑ {formatBytes(user.tx_bytes)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">Shell</div>
                <div className="text-slate-300 font-mono text-xs">{user.shell}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">User ID</div>
                <div className="text-slate-300">#{user.id}</div>
              </div>
            </div>
          </td>
        </tr>
      )}

      {showChangePass && (
        <ChangePassModal user={user} onClose={() => setShowChangePass(false)} />
      )}
    </>
  )
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/api/users')
      setUsers(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.note.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">SSH Users</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus size={16} /> Add User
        </button>
      </div>

      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700 text-left">
                <th className="py-3 px-4 font-medium">Username</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Expires</th>
                <th className="py-3 px-4 font-medium">Traffic / Quota</th>
                <th className="py-3 px-4 font-medium">Sessions</th>
                <th className="py-3 px-4 font-medium">Created</th>
                <th className="py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {search ? 'No users match your search' : 'No users yet. Add one!'}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <UserRow key={u.id} user={u} onRefresh={fetchUsers} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <AddUserModal onClose={() => setShowAdd(false)} onCreated={fetchUsers} />
      )}
    </div>
  )
}
