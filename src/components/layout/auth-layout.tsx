import type { ReactNode } from 'react'
import { Logo } from './logo'

/** Split layout used by sign-in, sign-up, password and invite pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_480px]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-white lg:flex">
        <Logo inverted />
        <div className="max-w-md">
          <p className="text-2xl leading-snug font-medium">
            Orders, tables, kitchen and payments for every branch, in one place.
          </p>
          <p className="mt-3 text-sm text-sidebar-foreground">
            Built for restaurants in Pakistan and beyond.
          </p>
        </div>
        <div className="text-xs text-sidebar-muted">© EdgeX Restaurant ERP</div>
      </div>
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  )
}
