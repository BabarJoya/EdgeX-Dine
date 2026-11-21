import {
  Armchair,
  ChartColumn,
  ChefHat,
  HandPlatter,
  LayoutGrid,
  MonitorPlay,
  Package,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { label: string; to: string; icon: LucideIcon; end?: boolean }
export type NavGroup = { label: string; items: NavItem[] }

export const ownerNav: NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { label: 'Overview', to: '/app', icon: LayoutGrid, end: true },
      { label: 'Orders', to: '/app/orders', icon: ReceiptText },
      { label: 'Tables', to: '/app/tables', icon: Armchair },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Menu', to: '/app/menu', icon: UtensilsCrossed },
      { label: 'Staff', to: '/app/staff', icon: UserCog },
      { label: 'Customers', to: '/app/customers', icon: Users },
      { label: 'Inventory', to: '/app/inventory', icon: Package },
      { label: 'Reports', to: '/app/reports', icon: ChartColumn },
    ],
  },
  {
    label: 'Stations',
    items: [
      { label: 'POS', to: '/pos', icon: MonitorPlay },
      { label: 'Kitchen display', to: '/kds', icon: ChefHat },
      { label: 'Waiter app', to: '/waiter', icon: HandPlatter },
    ],
  },
]

export const settingsNav: NavItem = { label: 'Settings', to: '/app/settings', icon: Settings }
