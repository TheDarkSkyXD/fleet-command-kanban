import { useState, useEffect, useCallback } from 'react'
import { X, Download, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion?: string
  releaseName?: string
  releaseNotes?: string
  releaseUrl?: string
  publishedAt?: string
}

const isElectron = typeof window !== 'undefined' &&
  'electronAPI' in window

export function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => {
    if (!isElectron) return

    const api = (window as any).electronAPI

    const handler = (info: UpdateInfo) => {
      // Only show if not already dismissed for this version
      const dismissedVersion = localStorage.getItem('fleet-update-dismissed')
      if (dismissedVersion === info.latestVersion) return
      setUpdateInfo(info)
      setDismissed(false)
    }

    api.on('update-available', handler)

    return () => {
      api.removeAllListeners('update-available')
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    if (updateInfo?.latestVersion) {
      localStorage.setItem('fleet-update-dismissed', updateInfo.latestVersion)
    }
  }, [updateInfo])

  const handleInstall = useCallback(() => {
    if (!updateInfo?.releaseUrl) return
    const api = (window as any).electronAPI
    api.invoke('open-release-url', updateInfo.releaseUrl)
  }, [updateInfo])

  const handleViewChangelog = useCallback(() => {
    setShowChangelog((prev) => !prev)
  }, [])

  if (!updateInfo?.available || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-sm font-medium text-text-primary">
              Update Available
            </span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Version info */}
        <div className="px-4 pb-3">
          <p className="text-xs text-text-secondary">
            <span className="text-text-muted">v{updateInfo.currentVersion}</span>
            {' → '}
            <span className="text-accent-green font-medium">v{updateInfo.latestVersion}</span>
          </p>
          {updateInfo.releaseName && (
            <p className="text-sm text-text-primary mt-1 line-clamp-1">
              {updateInfo.releaseName}
            </p>
          )}
        </div>

        {/* Changelog (expandable) */}
        {showChangelog && updateInfo.releaseNotes && (
          <div className="px-4 pb-3 border-t border-border pt-3">
            <pre className="text-xs text-text-secondary whitespace-pre-wrap max-h-48 overflow-y-auto font-sans leading-relaxed">
              {updateInfo.releaseNotes}
            </pre>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex border-t border-border">
          <button
            onClick={handleViewChangelog}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors',
              'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
              showChangelog && 'bg-bg-tertiary text-text-primary'
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Changelogs
          </button>
          <div className="w-px bg-border" />
          <button
            onClick={handleInstall}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-accent-green hover:bg-accent-green/10 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
