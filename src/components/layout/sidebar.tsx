import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { useTenant } from '@/features/tenant/tenant-provider'
import { ownerNav, settingsNav, supportNav, visible, type NavItem } from './nav'

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-sm bg-sidebar-highlight"
            />
          )}
          <Icon className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useTenant()
  const groups = ownerNav
    .map((g) => ({ ...g, items: g.items.filter((i) => visible(i, can)) }))
    .filter((g) => g.items.length > 0)
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center px-5 text-white">
        <Logo inverted />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="mb-1.5 px-2.5 text-[11px] font-medium tracking-[0.06em] text-sidebar-muted uppercase">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <SidebarLink key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="grid gap-0.5 border-t border-sidebar-border px-3 py-3">
        <SidebarLink item={supportNav} onNavigate={onNavigate} />
        {visible(settingsNav, can) && <SidebarLink item={settingsNav} onNavigate={onNavigate} />}
      </div>
    </div>
  )
}
