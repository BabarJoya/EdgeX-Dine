import {
  Armchair,
  ChartColumn,
  ChefHat,
  HandPlatter,
  LayoutGrid,
  MonitorPlay,
  Package,
  ReceiptText,
  LifeBuoy,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
  /** Shown when the member holds ANY of these permissions (none = everyone). */
  perms?: string[]
}
export type NavGroup = { label: string; items: NavItem[] }

export const ownerNav: NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { label: 'Overview', to: '/app', icon: LayoutGrid, end: true },
      { label: 'Orders', to: '/app/orders', icon: ReceiptText, perms: ['orders.view'] },
      { label: 'Tables', to: '/app/tables', icon: Armchair, perms: ['tables.view'] },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Menu', to: '/app/menu', icon: UtensilsCrossed, perms: ['menu.view'] },
      {
        label: 'Staff',
        to: '/app/staff',
        icon: UserCog,
        perms: ['staff.view', 'staff.manage', 'roles.manage'],
      },
      { label: 'Customers', to: '/app/customers', icon: Users, perms: ['customers.view'] },
      { label: 'Inventory', to: '/app/inventory', icon: Package, perms: ['inventory.view'] },
      { label: 'Reports', to: '/app/reports', icon: ChartColumn, perms: ['reports.view'] },
    ],
  },
  {
    label: 'Stations',
    items: [
      { label: 'POS', to: '/pos', icon: MonitorPlay, perms: ['pos.use'] },
      { label: 'Kitchen display', to: '/kds', icon: ChefHat, perms: ['kitchen.view'] },
      { label: 'Waiter app', to: '/waiter', icon: HandPlatter, perms: ['tables.view'] },
    ],
  },
]

export const settingsNav: NavItem = {
  label: 'Settings',
  to: '/app/settings',
  icon: Settings,
  perms: ['settings.manage', 'branches.manage', 'billing.manage'],
}

export function visible(item: NavItem, can: (perm: string) => boolean) {
  return !item.perms || item.perms.some(can)
}

export const supportNav: NavItem = { label: 'Help & support', to: '/app/support', icon: LifeBuoy }
