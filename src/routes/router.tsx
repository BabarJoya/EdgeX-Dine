import { ChartColumn, ChefHat, MonitorPlay, Package, ShieldCheck, Users } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { RedirectIfAuthed, RequireAuth, RequireTenant } from '@/features/auth/guards'
import { isSupabaseConfigured } from '@/lib/supabase'
import { NotFoundPage } from '@/pages/not-found'
import { SetupRequiredPage } from '@/pages/setup-required'

// Route groups are split into separate chunks: guests scanning a QR code
// never download the back-office or POS code.
const named = <K extends string, M extends Record<K, React.ComponentType>>(p: Promise<M>, key: K) =>
  p.then((m) => ({ default: m[key] }))

const AppShell = lazy(() => named(import('@/components/layout/app-shell'), 'AppShell'))
const OverviewPage = lazy(() => named(import('@/pages/app/overview'), 'OverviewPage'))
const UpcomingPage = lazy(() =>
  import('@/pages/app/upcoming').then((m) => ({ default: m.UpcomingPage })),
)
const StaffPage = lazy(() => named(import('@/pages/app/staff'), 'StaffPage'))
const MenuPage = lazy(() => named(import('@/pages/app/menu'), 'MenuPage'))
const TablesPage = lazy(() => named(import('@/pages/app/tables'), 'TablesPage'))
const OrdersPage = lazy(() => named(import('@/pages/app/orders'), 'OrdersPage'))
const PrintQrPage = lazy(() => named(import('@/pages/print-qr'), 'PrintQrPage'))
const SettingsPage = lazy(() => named(import('@/pages/app/settings'), 'SettingsPage'))
const DesignSystemPage = lazy(() => named(import('@/pages/design-system'), 'DesignSystemPage'))
const LoginPage = lazy(() => named(import('@/pages/auth/login'), 'LoginPage'))
const SignupPage = lazy(() => named(import('@/pages/auth/signup'), 'SignupPage'))
const ForgotPasswordPage = lazy(() =>
  named(import('@/pages/auth/forgot-password'), 'ForgotPasswordPage'),
)
const ResetPasswordPage = lazy(() =>
  named(import('@/pages/auth/reset-password'), 'ResetPasswordPage'),
)
const AcceptInvitePage = lazy(() => named(import('@/pages/auth/accept-invite'), 'AcceptInvitePage'))
const OnboardingPage = lazy(() => named(import('@/pages/onboarding'), 'OnboardingPage'))
const KitchenPage = lazy(() => named(import('@/pages/ops/kitchen'), 'KitchenPage'))
const WaiterPage = lazy(() => named(import('@/pages/ops/waiter'), 'WaiterPage'))
const StationPlaceholder = lazy(() =>
  import('@/pages/ops/station-placeholder').then((m) => ({ default: m.StationPlaceholder })),
)
const GuestMenuPage = lazy(() => named(import('@/pages/guest/guest-menu'), 'GuestMenuPage'))

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
]

const station = (name: string, icon: typeof ChefHat, phase: string, summary: string) => (
  <RequireAuth>
    {s(<StationPlaceholder name={name} icon={icon} phase={phase} summary={summary} />)}
  </RequireAuth>
)

export const router = createBrowserRouter(
  isSupabaseConfigured
    ? [
        { path: '/', element: <Navigate to="/app" replace /> },
        { path: '/login', element: <RedirectIfAuthed>{s(<LoginPage />)}</RedirectIfAuthed> },
        { path: '/signup', element: <RedirectIfAuthed>{s(<SignupPage />)}</RedirectIfAuthed> },
        { path: '/forgot-password', element: s(<ForgotPasswordPage />) },
        { path: '/reset-password', element: <RequireAuth>{s(<ResetPasswordPage />)}</RequireAuth> },
        { path: '/invite/:token', element: s(<AcceptInvitePage />) },
        { path: '/onboarding', element: <RequireAuth>{s(<OnboardingPage />)}</RequireAuth> },
        {
          path: '/app',
          element: (
            <RequireAuth>
              <RequireTenant>{s(<AppShell />)}</RequireTenant>
            </RequireAuth>
          ),
          children: [
            { index: true, element: s(<OverviewPage />) },
            { path: 'staff', element: s(<StaffPage />) },
            { path: 'settings', element: s(<SettingsPage />) },
            { path: 'menu', element: s(<MenuPage />) },
            { path: 'tables', element: s(<TablesPage />) },
            { path: 'orders', element: s(<OrdersPage />) },
            { path: 'design', element: s(<DesignSystemPage />) },
            ...upcoming.map(({ path, ...p }) => ({ path, element: s(<UpcomingPage {...p} />) })),
          ],
        },
        {
          path: '/print/qr',
          element: (
            <RequireAuth>
              <RequireTenant>{s(<PrintQrPage />)}</RequireTenant>
            </RequireAuth>
          ),
        },
        {
          path: '/pos',
          element: station(
            'POS',
            MonitorPlay,
            'Phase 5',
            'Touch-friendly billing with split payments, discounts and thermal receipts.',
          ),
        },
        {
          path: '/kds',
          element: (
            <RequireAuth>
              <RequireTenant>{s(<KitchenPage />)}</RequireTenant>
            </RequireAuth>
          ),
        },
        {
          path: '/waiter',
          element: (
            <RequireAuth>
              <RequireTenant>{s(<WaiterPage />)}</RequireTenant>
            </RequireAuth>
          ),
        },
        {
          path: '/admin',
          element: station(
            'Platform admin',
            ShieldCheck,
            'Phase 6',
            'Manage restaurants, subscription plans and platform billing.',
          ),
        },
        { path: '/m/:slug', element: s(<GuestMenuPage />) },
        { path: '*', element: <NotFoundPage /> },
      ]
    : [{ path: '*', element: <SetupRequiredPage /> }],
)
