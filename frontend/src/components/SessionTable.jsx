import { XCircle } from 'lucide-react'
import api from '../api/client'

export default function SessionTable({ sessions, onRefresh }) {
  const handleKill = async (pid) => {
    if (!confirm(`Kill PID ${pid}?`)) return
    try {
      await api.delete(`/api/sessions/${pid}`)
      onRefresh?.()
    } catch (err) {
      alert(err.response?.data?.detail || 'Kill failed')
    }
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-slate-400 border-b border-slate-700">
          <th className="text-left py-2 px-3 font-medium">User</th>
          <th className="text-left py-2 px-3 font-medium">IP</th>
          <th className="text-left py-2 px-3 font-medium">PID</th>
          <th className="text-left py-2 px-3 font-medium">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-700/50">
        {sessions.map((s, i) => (
          <tr key={i} className="hover:bg-slate-700/20 transition-colors">
            <td className="py-2 px-3 font-mono text-slate-200">{s.username}</td>
            <td className="py-2 px-3 text-slate-400 font-mono text-xs">{s.ip || '—'}</td>
            <td className="py-2 px-3 text-slate-500 text-xs">{s.pid || '—'}</td>
            <td className="py-2 px-3">
              {s.pid && (
                <button
                  onClick={() => handleKill(s.pid)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <XCircle size={16} />
                </button>
              )}
            </td>
          </tr>
        ))}
        {sessions.length === 0 && (
          <tr>
            <td colSpan={4} className="py-6 text-center text-slate-500">No sessions</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
