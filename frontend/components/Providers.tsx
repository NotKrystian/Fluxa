'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { SettingsButton } from '@/components/SettingsButton'
import { wagmiConfig } from '@/config/wagmi'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside the component to avoid sharing between requests
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          {children}
          <SettingsButton />
        </SettingsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

