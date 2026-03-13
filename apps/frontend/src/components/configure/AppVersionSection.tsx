import { useState, useCallback, useEffect } from 'react'
import { RefreshCw, ExternalLink, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const isElectron = typeof window !== 'undefined' &&
  'electronAPI' in window

interface UpdateCheckResult {
  available: boolean
  currentVersion: string
  latestVersion?: string
  releaseName?: string
  releaseNotes?: string
  releaseUrl?: string
}

export function AppVersionSection() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    if (!isElectron) return
    const api = (window as any).electronAPI
    api.invoke('get-app-version').then((v: string) => setCurrentVersion(v))
  }, [])

  const handleCheckForUpdate = useCallback(async () => {
    if (!isElectron) return
    setChecking(true)
    setCheckResult(null)
    try {
      const api = (window as any).electronAPI
      const result = await api.invoke('check-for-update')
      setCheckResult(result)
    } catch {
      setCheckResult(null)
    } finally {
      setChecking(false)
    }
  }, [])

  const handleOpenRelease = useCallback(() => {
    if (!checkResult?.releaseUrl || !isElectron) return
    const api = (window as any).electronAPI
    api.invoke('open-release-url', checkResult.releaseUrl)
  }, [checkResult])

  if (!isElectron) return null

  return (
    <div className="space-y-3">
      {/* Current version */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-secondary">Current Version:</span>
        <span className="text-sm font-mono font-medium text-text-primary">
          {currentVersion ? `v${currentVersion}` : '...'}
        </span>
      </div>

      {/* Check for updates button */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheckForUpdate}
          disabled={checking}
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', checking && 'animate-spin')} />
          {checking ? 'Checking...' : 'Check for Updates'}
        </Button>
      </div>

      {/* Result */}
      {checkResult && (
        <div className={cn(
          'flex items-start gap-2 p-3 rounded-md border text-sm',
          checkResult.available
            ? 'bg-accent-green/5 border-accent-green/20'
            : 'bg-bg-tertiary border-border'
        )}>
          {checkResult.available ? (
            <>
              <AlertCircle className="h-4 w-4 text-accent-green mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-text-primary">
                  New version available: <span className="font-mono font-medium text-accent-green">v{checkResult.latestVersion}</span>
                </p>
                {checkResult.releaseName && (
                  <p className="text-text-secondary text-xs">{checkResult.releaseName}</p>
                )}
                <button
                  onClick={handleOpenRelease}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline mt-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  View on GitHub
                </button>
              </div>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 text-accent-green mt-0.5 shrink-0" />
              <p className="text-text-secondary">You're on the latest version.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
