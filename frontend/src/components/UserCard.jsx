import TrafficBadge from './TrafficBadge'

export default function UserCard({ user }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono font-semibold text-slate-100">{user.username}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          user.is_active ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
        }`}>
          {user.is_active ? 'Active' : 'Locked'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div>Sessions: <span className="text-slate-200">{user.active_sessions}/{user.max_connections}</span></div>
        <div>Traffic: <TrafficBadge bytes={user.used_bytes} /></div>
      </div>
    </div>
  )
}
