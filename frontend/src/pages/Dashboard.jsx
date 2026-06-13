import { useEffect, useState, useCallback } from 'react'
import { Users, Activity, Database, Wifi } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import api from '../api/client'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
    </div>
  )
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/api/stats'),
        api.get('/api/users'),
      ])
      setStats(statsRes.data)
      setUsers(usersRes.data)
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const topUsers = [...users]
    .sort((a, b) => (b.used_bytes + b.tx_bytes) - (a.used_bytes + a.tx_bytes))
    .slice(0, 5)
    .map((u) => ({
      name: u.username,
      traffic: Math.round((u.used_bytes + u.tx_bytes) / (1024 * 1024)),
    }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <span className="text-xs text-slate-500">Auto-refresh 30s</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={stats?.total_users ?? 0}
          color="bg-indigo-500/20 text-indigo-400"
        />
        <StatCard
          icon={Activity}
          label="Active Users"
          value={stats?.active_users ?? 0}
          color="bg-green-500/20 text-green-400"
        />
        <StatCard
          icon={Database}
          label="Total Traffic"
          value={formatBytes(stats?.total_traffic_bytes ?? 0)}
          color="bg-amber-500/20 text-amber-400"
        />
        <StatCard
          icon={Wifi}
          label="Live Sessions"
          value={stats?.active_sessions ?? 0}
          color="bg-blue-500/20 text-blue-400"
        />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h2 className="text-base font-semibold text-slate-200 mb-4">Top 5 Users by Traffic (MB)</h2>
        {topUsers.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topUsers} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                itemStyle={{ color: '#6366f1' }}
              />
              <Bar dataKey="traffic" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-32 text-slate-500">
            No traffic data yet
          </div>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h2 className="text-base font-semibold text-slate-200 mb-4">User Overview</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left pb-3 font-medium">Username</th>
                <th className="text-left pb-3 font-medium">Status</th>
                <th className="text-left pb-3 font-medium">Traffic</th>
                <th className="text-left pb-3 font-medium">Sessions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {users.slice(0, 10).map((u) => (
                <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 text-slate-200 font-mono">{u.username}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.is_active
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}>
                      {u.is_active ? 'Active' : 'Locked'}
                    </span>
                  </td>
                  <td className="py-3 text-slate-300">{formatBytes(u.used_bytes)}</td>
                  <td className="py-3 text-slate-300">{u.active_sessions}/{u.max_connections}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
