'use client'

import { useState } from 'react'
import { Settings, Moon, Sun, Code, X } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

export function SettingsButton() {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, devMode, toggleTheme, toggleDevMode } = useSettings()

  return (
    <>
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-40 p-3 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all hover:scale-110"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
            <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-2xl font-bold">Settings</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Theme Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {theme === 'dark' ? (
                      <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    ) : (
                      <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    )}
                    <div>
                      <div className="font-semibold">Theme</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                    aria-label="Toggle theme"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Dev Mode Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Code className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    <div>
                      <div className="font-semibold">Developer Mode</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {devMode ? 'Show technical details' : 'Hide technical details'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleDevMode}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      devMode ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                    aria-label="Toggle dev mode"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        devMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Info */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {devMode
                      ? 'Developer mode is ON. Technical details like contract addresses and detailed fees are visible.'
                      : 'Developer mode is OFF. Technical details are hidden for a cleaner experience.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

