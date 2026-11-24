import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/auth-provider'
import { TenantProvider } from '@/features/tenant/tenant-provider'
import { ThemeProvider } from '@/hooks/use-theme'
import { queryClient } from '@/lib/query-client'
import { persistOptions } from '@/lib/query-persist'
import { router } from '@/routes/router'
import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        // The device copy is only a head start (and the offline fallback):
        // refresh everything from the server as soon as it is restored.
        onSuccess={() => void queryClient.invalidateQueries()}
      >
        <AuthProvider>
          <TenantProvider>
            <TooltipProvider delayDuration={300}>
              <RouterProvider router={router} />
              <Toaster />
            </TooltipProvider>
          </TenantProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
