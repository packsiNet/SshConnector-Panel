export default function TrafficBadge({ bytes }) {
  const fmt = (b) => {
    if (!b || b === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const color =
    bytes > 10 * 1024 * 1024 * 1024
      ? 'bg-red-500/15 text-red-400'
      : bytes > 1024 * 1024 * 1024
      ? 'bg-amber-500/15 text-amber-400'
      : 'bg-slate-700 text-slate-300'

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${color}`}>
      {fmt(bytes)}
    </span>
  )
}
