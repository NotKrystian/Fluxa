'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface SettingsContextType {
  theme: 'light' | 'dark'
  devMode: boolean
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  setDevMode: (enabled: boolean) => void
  toggleDevMode: () => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark')
  const [devMode, setDevModeState] = useState<boolean>(true)

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('fluxa-theme') as 'light' | 'dark' | null
    const savedDevMode = localStorage.getItem('fluxa-dev-mode')
    
    if (savedTheme) {
      setThemeState(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setThemeState(prefersDark ? 'dark' : 'light')
      document.documentElement.classList.toggle('dark', prefersDark)
    }
    
    if (savedDevMode !== null) {
      setDevModeState(savedDevMode === 'true')
    }
  }, [])

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme)
    localStorage.setItem('fluxa-theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  const setDevMode = (enabled: boolean) => {
    setDevModeState(enabled)
    localStorage.setItem('fluxa-dev-mode', enabled.toString())
  }

  const toggleDevMode = () => {
    setDevMode(!devMode)
  }

  return (
    <SettingsContext.Provider
      value={{
        theme,
        devMode,
        setTheme,
        toggleTheme,
        setDevMode,
        toggleDevMode,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

