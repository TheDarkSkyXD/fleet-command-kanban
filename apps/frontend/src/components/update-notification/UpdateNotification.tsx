import { useState, useEffect, useCallback } from 'react'
import { X, Download, FileText, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion?: string
  releaseName?: string
  releaseNotes?: string
  releaseDate?: string
}

interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

type UpdateState = 'available' | 'downloading' | 'downloaded' | 'error'

const isElectron = typeof window !== 'undefined' &&
  'electronAPI' in window

export function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>('available')
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isElectron) return

    const api = (window as any).electronAPI

    const handleAvailable = (info: UpdateInfo) => {
      const dismissedVersion = localStorage.getItem('fleet-update-dismissed')
      if (dismissedVersion === info.latestVersion) return
      setUpdateInfo(info)
      setUpdateState('available')
      setDismissed(false)
      setDownloadProgress(null)
      setErrorMessage(null)
    }

    const handleProgress = (progress: DownloadProgress) => {
      setDownloadProgress(progress)
    }

    const handleDownloaded = () => {
      setUpdateState('downloaded')
      setDownloadProgress(null)
    }

    const handleError = (message: string) => {
      setUpdateState('error')
      setErrorMessage(message)
    }

    api.on('update-available', handleAvailable)
    api.on('update-download-progress', handleProgress)
    api.on('update-downloaded', handleDownloaded)
    api.on('update-error', handleError)

    return () => {
      api.removeAllListeners('update-available')
      api.removeAllListeners('update-download-progress')
      api.removeAllListeners('update-downloaded')
      api.removeAllListeners('update-error')
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    if (updateInfo?.latestVersion) {
      localStorage.setItem('fleet-update-dismissed', updateInfo.latestVersion)
    }
  }, [updateInfo])

  const handleDownload = useCallback(() => {
    const api = (window as any).electronAPI
    setUpdateState('downloading')
    setDownloadProgress(null)
    api.invoke('download-update')
  }, [])

  const handleInstall = useCallback(() => {
    const api = (window as any).electronAPI
    api.invoke('install-update')
  }, [])

  const handleRetry = useCallback(() => {
    setUpdateState('available')
    setErrorMessage(null)
  }, [])

  const handleViewChangelog = useCallback(() => {
    setShowChangelog((prev) => !prev)
  }, [])

  if (!updateInfo?.available || dismissed) return null

  const progressPercent = downloadProgress ? Math.round(downloadProgress.percent) : 0

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-2 w-2 rounded-full",
              updateState === 'downloaded' ? 'bg-accent-green' : 'bg-accent-green animate-pulse'
            )} />
            <span className="text-sm font-medium text-text-primary">
              {updateState === 'downloading' && 'Downloading Update...'}
              {updateState === 'downloaded' && 'Ready to Install'}
              {updateState === 'error' && 'Update Error'}
              {updateState === 'available' && 'Update Available'}
            </span>
          </div>
          {updateState !== 'downloading' && (
            <button
              onClick={handleDismiss}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Version info */}
        <div className="px-4 pb-3">
          <p className="text-xs text-text-secondary">
            <span className="text-text-muted">v{updateInfo.currentVersion}</span>
            {' → '}
            <span className="text-accent-green font-medium">v{updateInfo.latestVersion}</span>
          </p>
          {updateInfo.releaseName && updateState === 'available' && (
            <p className="text-sm text-text-primary mt-1 line-clamp-1">
              {updateInfo.releaseName}
            </p>
          )}
        </div>

        {/* Download progress bar */}
        {updateState === 'downloading' && (
          <div className="px-4 pb-3">
            <div className="w-full bg-bg-tertiary rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent-green h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              {progressPercent}%
              {downloadProgress && downloadProgress.total > 0 && (
                <span> — {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
              )}
            </p>
          </div>
        )}

        {/* Error message */}
        {updateState === 'error' && errorMessage && (
          <div className="px-4 pb-3">
            <p className="text-xs text-accent-red line-clamp-2">{errorMessage}</p>
          </div>
        )}

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
          {updateState === 'available' && (
            <>
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
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-accent-green hover:bg-accent-green/10 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download & Install
              </button>
            </>
          )}

          {updateState === 'downloading' && (
            <div className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Downloading...
            </div>
          )}

          {updateState === 'downloaded' && (
            <button
              onClick={handleInstall}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-accent-green hover:bg-accent-green/10 transition-colors"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Restart & Install
            </button>
          )}

          {updateState === 'error' && (
            <button
              onClick={handleRetry}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
