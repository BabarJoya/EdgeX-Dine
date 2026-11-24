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
const PosPage = lazy(() => named(import('@/pages/ops/pos'), 'PosPage'))
const ReceiptPage = lazy(() => named(import('@/pages/receipt'), 'ReceiptPage'))
const AdminLayout = lazy(() => named(import('@/pages/admin/admin'), 'AdminLayout'))
const AdminOverviewPage = lazy(() => named(import('@/pages/admin/admin'), 'AdminOverviewPage'))
const AdminRestaurantsPage = lazy(() =>
  named(import('@/pages/admin/admin'), 'AdminRestaurantsPage'),
)
const AdminPlansPage = lazy(() => named(import('@/pages/admin/admin'), 'AdminPlansPage'))
const AdminSupportPage = lazy(() => named(import('@/pages/admin/admin'), 'AdminSupportPage'))
const AdminSettingsPage = lazy(() => named(import('@/pages/admin/admin'), 'AdminSettingsPage'))
const ReservationsPage = lazy(() => named(import('@/pages/app/reservations'), 'ReservationsPage'))
const BookPage = lazy(() => named(import('@/pages/guest/book'), 'BookPage'))
const ReservationPage = lazy(() => named(import('@/pages/guest/book'), 'ReservationPage'))
const OrderOnlinePage = lazy(() => named(import('@/pages/guest/order-online'), 'OrderOnlinePage'))
const TrackOrderPage = lazy(() => named(import('@/pages/guest/order-online'), 'TrackOrderPage'))
const CustomersPage = lazy(() => named(import('@/pages/app/customers'), 'CustomersPage'))
const InventoryPage = lazy(() => named(import('@/pages/app/inventory'), 'InventoryPage'))
const ReportsPage = lazy(() => named(import('@/pages/app/reports'), 'ReportsPage'))
const SupportPage = lazy(() => named(import('@/pages/app/support'), 'SupportPage'))
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
            { path: 'support', element: s(<SupportPage />) },
            { path: 'reports', element: s(<ReportsPage />) },
            { path: 'inventory', element: s(<InventoryPage />) },
            { path: 'customers', element: s(<CustomersPage />) },
            { path: 'reservations', element: s(<ReservationsPage />) },
            { path: 'design', element: s(<DesignSystemPage />) },
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
          element: (
            <RequireAuth>
              <RequireTenant>{s(<PosPage />)}</RequireTenant>
            </RequireAuth>
          ),
        },
        { path: '/r/:token', element: s(<ReceiptPage />) },
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
          element: <RequireAuth>{s(<AdminLayout />)}</RequireAuth>,
          children: [
            { index: true, element: s(<AdminOverviewPage />) },
            { path: 'restaurants', element: s(<AdminRestaurantsPage />) },
            { path: 'plans', element: s(<AdminPlansPage />) },
            { path: 'support', element: s(<AdminSupportPage />) },
            { path: 'settings', element: s(<AdminSettingsPage />) },
          ],
        },
        { path: '/m/:slug', element: s(<GuestMenuPage />) },
        { path: '/book/:slug', element: s(<BookPage />) },
        { path: '/o/:slug', element: s(<OrderOnlinePage />) },
        { path: '/o/:slug/track/:token', element: s(<TrackOrderPage />) },
        { path: '/res/:token', element: s(<ReservationPage />) },
        { path: '*', element: <NotFoundPage /> },
      ]
    : [{ path: '*', element: <SetupRequiredPage /> }],
)
