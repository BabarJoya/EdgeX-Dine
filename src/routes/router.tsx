import {
  ChartColumn,
  ChefHat,
  HandPlatter,
  MonitorPlay,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  UtensilsCrossed,
  Armchair,
} from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { NotFoundPage } from '@/pages/not-found'

// Route groups are split into separate chunks: guests scanning a QR code
// never download the back-office or POS code.
const AppShell = lazy(() =>
  import('@/components/layout/app-shell').then((m) => ({ default: m.AppShell })),
)
const OverviewPage = lazy(() =>
  import('@/pages/app/overview').then((m) => ({ default: m.OverviewPage })),
)
const UpcomingPage = lazy(() =>
  import('@/pages/app/upcoming').then((m) => ({ default: m.UpcomingPage })),
)
const DesignSystemPage = lazy(() =>
  import('@/pages/design-system').then((m) => ({ default: m.DesignSystemPage })),
)
const LoginPage = lazy(() => import('@/pages/login').then((m) => ({ default: m.LoginPage })))
const StationPlaceholder = lazy(() =>
  import('@/pages/ops/station-placeholder').then((m) => ({ default: m.StationPlaceholder })),
)
const GuestMenuPage = lazy(() =>
  import('@/pages/guest/guest-menu').then((m) => ({ default: m.GuestMenuPage })),
)

function PageFallback() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

const s = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>

const upcoming = [
  {
    path: 'orders',
    title: 'Orders',
    icon: ReceiptText,
    phase: 'Phase 3',
    description: 'Every dine-in, takeaway and delivery order.',
    summary: 'Orders from the QR menu, waiters and the POS will be listed here with live status.',
  },
  {
    path: 'tables',
    title: 'Tables',
    icon: Armchair,
    phase: 'Phase 3',
    description: 'Floor plan, table status and QR codes.',
    summary: 'Draw your floor plan, add tables and print a QR code card for each one.',
  },
  {
    path: 'menu',
    title: 'Menu',
    icon: UtensilsCrossed,
    phase: 'Phase 2',
    description: 'Categories, items, variants and add-ons.',
    summary: 'Build your menu once and use it on the QR menu, POS and online ordering.',
  },
  {
    path: 'staff',
    title: 'Staff',
    icon: UserCog,
    phase: 'Phase 1',
    description: 'Team members, roles and permissions.',
    summary: 'Invite cashiers, waiters and kitchen staff and control what each role can do.',
  },
  {
    path: 'customers',
    title: 'Customers',
    icon: Users,
    phase: 'Phase 5',
    description: 'Guest profiles and visit history.',
    summary: 'Customers are saved from orders, reservations and receipts sent by WhatsApp.',
  },
  {
    path: 'inventory',
    title: 'Inventory',
    icon: Package,
    phase: 'Phase 9',
    description: 'Stock, recipes, suppliers and purchases.',
    summary: 'Track ingredients, cost each dish and get low-stock alerts.',
  },
  {
    path: 'reports',
    title: 'Reports',
    icon: ChartColumn,
    phase: 'Phase 7',
    description: 'Sales, items, staff and branch performance.',
    summary: 'Daily, weekly and monthly reports with Excel and PDF export.',
  },
  {
    path: 'settings',
    title: 'Settings',
    icon: Settings,
    phase: 'Phase 1',
    description: 'Restaurant profile, branches, taxes and billing.',
    summary: 'Manage branding, branches, tax rules and your subscription.',
  },
]

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/login', element: s(<LoginPage />) },
  {
    path: '/app',
    element: s(<AppShell />),
    children: [
      { index: true, element: s(<OverviewPage />) },
      ...upcoming.map(({ path, ...p }) => ({ path, element: s(<UpcomingPage {...p} />) })),
    ],
  },
  {
    path: '/design',
    element: s(<AppShell />),
    children: [{ index: true, element: s(<DesignSystemPage />) }],
  },
  {
    path: '/pos',
    element: s(
      <StationPlaceholder
        name="POS"
        icon={MonitorPlay}
        phase="Phase 5"
        summary="Touch-friendly billing with split payments, discounts and thermal receipts."
      />,
    ),
  },
  {
    path: '/kds',
    element: s(
      <StationPlaceholder
        name="Kitchen display"
        icon={ChefHat}
        phase="Phase 4"
        summary="Live order tickets per kitchen station, with timers and sound alerts."
      />,
    ),
  },
  {
    path: '/waiter',
    element: s(
      <StationPlaceholder
        name="Waiter app"
        icon={HandPlatter}
        phase="Phase 4"
        summary="Assigned tables, order taking and guest requests on the waiter's phone."
      />,
    ),
  },
  {
    path: '/admin',
    element: s(
      <StationPlaceholder
        name="Platform admin"
        icon={ShieldCheck}
        phase="Phase 6"
        summary="Manage restaurants, subscription plans and platform billing."
      />,
    ),
  },
  { path: '/m/:slug', element: s(<GuestMenuPage />) },
  { path: '*', element: <NotFoundPage /> },
])
