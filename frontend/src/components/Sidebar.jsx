import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Monitor, Terminal } from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/sessions', icon: Monitor, label: 'Sessions' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="p-1.5 bg-indigo-500/20 rounded-lg">
          <Terminal size={20} className="text-indigo-400" />
        </div>
        <div>
          <div className="font-bold text-slate-100 text-sm">SSH Panel</div>
          <div className="text-xs text-slate-500">Management</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
