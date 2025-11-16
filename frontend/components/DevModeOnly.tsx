'use client'

import { useSettings } from '@/contexts/SettingsContext'
import { ReactNode, useState, useEffect } from 'react'

interface DevModeOnlyProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Component that only renders children when dev mode is enabled
 * Use this to hide technical details like contract addresses, detailed fees, etc.
 * Always maintains consistent structure to avoid hydration mismatches.
 */
export function DevModeOnly({ children, fallback = null }: DevModeOnlyProps) {
  const { devMode } = useSettings()
  const [mounted, setMounted] = useState(false)
  
  // Ensure client-side only rendering to match server
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // During SSR and initial render, always show fallback to match server
  // Always return a fragment to maintain structure
  if (!mounted) {
    return fallback !== null ? <>{fallback}</> : <>{children}</>
  }
  
  // After mount, show content based on dev mode
  // Always return a fragment to maintain structure
  if (!devMode) {
    return fallback !== null ? <>{fallback}</> : <>{null}</>
  }
  
  return <>{children}</>
}

