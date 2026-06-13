import { useEffect, useState, useCallback } from 'react'
import { Wifi, XCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import api from '../api/client'

function formatDuration(loginTime) {
  if (!loginTime) return '—'
  try {
    const now = new Date()
    const start = new Date(loginTime)
    const diff = Math.floor((now - start) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  } catch {
    return loginTime
  }
}

export default function Sessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [enforcing, setEnforcing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/api/sessions')
      setSessions(res.data)
      setLastRefresh(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 10000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const handleKill = async (pid) => {
    if (!confirm(`Kill session PID ${pid}?`)) return
    try {
      await api.delete(`/api/sessions/${pid}`)
      fetchSessions()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to kill session')
    }
  }

  const handleEnforce = async () => {
    setEnforcing(true)
    try {
      const res = await api.post('/api/sessions/enforce')
      alert(res.data.message)
      fetchSessions()
    } catch (err) {
      alert(err.response?.data?.detail || 'Enforce failed')
    } finally {
      setEnforcing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-100">Active Sessions</h1>
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-sm">
            <Wifi size={14} className="text-green-400" />
            <span className="text-slate-300">{sessions.length} live</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {lastRefresh.toLocaleTimeString()} · auto 10s
          </span>
          <button
            onClick={fetchSessions}
            className="p-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleEnforce}
            disabled={enforcing}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <ShieldAlert size={16} />
            {enforcing ? 'Enforcing...' : 'Enforce Limits'}
          </button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700 text-left">
                <th className="py-3 px-4 font-medium">Username</th>
                <th className="py-3 px-4 font-medium">IP Address</th>
                <th className="py-3 px-4 font-medium">Login Time</th>
                <th className="py-3 px-4 font-medium">Duration</th>
                <th className="py-3 px-4 font-medium">PID</th>
                <th className="py-3 px-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No active SSH sessions
                  </td>
                </tr>
              ) : (
                sessions.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-200">{s.username}</td>
                    <td className="py-3 px-4">
                      <span className="text-slate-300 font-mono text-xs bg-slate-700/50 px-2 py-0.5 rounded">
                        {s.ip || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs">{s.login_time || '—'}</td>
                    <td className="py-3 px-4 text-slate-300">{formatDuration(s.login_time)}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-xs">{s.pid || '—'}</td>
                    <td className="py-3 px-4">
                      {s.pid ? (
                        <button
                          onClick={() => handleKill(s.pid)}
                          className="flex items-center gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors text-xs"
                        >
                          <XCircle size={14} /> Kill
                        </button>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
