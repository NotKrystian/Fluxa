'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Circle, Loader2, XCircle, ArrowRight } from 'lucide-react'

export interface SwapStep {
  name: string
  status: 'pending' | 'in_progress' | 'complete' | 'failed'
  timestamp?: number
  txHash?: string
  error?: string
}

export interface SwapProgress {
  swapId: string
  status: 'initiated' | 'in_progress' | 'complete' | 'failed'
  currentStep: number
  totalSteps: number
  steps: SwapStep[]
  error?: string
}

interface SwapProgressTrackerProps {
  progress: SwapProgress | null
  onComplete?: () => void
  onError?: (error: string) => void
}

export default function SwapProgressTracker({ progress, onComplete, onError }: SwapProgressTrackerProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [startTime] = useState(Date.now())

  // Update elapsed time every second
  useEffect(() => {
    if (!progress || progress.status === 'complete' || progress.status === 'failed') {
      return
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [progress, startTime])

  // Handle completion/error
  useEffect(() => {
    if (!progress) return

    if (progress.status === 'complete' && onComplete) {
      onComplete()
    }

    if (progress.status === 'failed' && onError) {
      onError(progress.error || 'Swap failed')
    }
  }, [progress?.status])

  if (!progress) {
    return null
  }

  const progressPercentage = (progress.currentStep / progress.totalSteps) * 100

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold">
              {progress.status === 'complete' ? '✅ Swap Complete!' :
               progress.status === 'failed' ? '❌ Swap Failed' :
               '⚡ Processing Swap...'}
            </h2>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {formatTime(elapsedTime)}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="relative w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`absolute top-0 left-0 h-full transition-all duration-500 ease-out ${
                progress.status === 'failed' ? 'bg-red-500' :
                progress.status === 'complete' ? 'bg-green-500' :
                'bg-blue-500 animate-pulse'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>Step {progress.currentStep} of {progress.totalSteps}</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {progress.steps.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-1">
                {step.status === 'complete' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : step.status === 'failed' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : step.status === 'in_progress' ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`font-medium ${
                    step.status === 'complete' ? 'text-green-700 dark:text-green-300' :
                    step.status === 'failed' ? 'text-red-700 dark:text-red-300' :
                    step.status === 'in_progress' ? 'text-blue-700 dark:text-blue-300' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {step.name}
                  </p>
                  {step.timestamp && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatTime(Math.floor((Date.now() - step.timestamp) / 1000))} ago
                    </span>
                  )}
                </div>

                {step.txHash && (
                  <a
                    href={`https://testnet.arcscan.com/tx/${step.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-1"
                  >
                    View Transaction <ArrowRight className="w-3 h-3" />
                  </a>
                )}

                {step.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {step.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {progress.status === 'complete' || progress.status === 'failed' ? (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {progress.status === 'complete' ? 'Done' : 'Close'}
            </button>
          </div>
        ) : (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Please wait while we process your swap...</span>
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-500 mt-2">
              This may take a few minutes depending on network conditions
            </p>
          </div>
        )}

        {/* Swap ID */}
        <div className="mt-4 text-xs text-center text-gray-400 dark:text-gray-500 font-mono">
          Swap ID: {progress.swapId}
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
}

