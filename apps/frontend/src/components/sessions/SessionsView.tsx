import { useState, useMemo } from 'react'
import { useSessions, useStopSession } from '@/hooks/queries'
import { SessionCard } from './SessionCard'
import { SessionLogModal } from './SessionLogModal'
import type { Session } from '@fleet-command/shared'

export function SessionsView() {
  const { data: sessions, isLoading } = useSessions()
  const stopSession = useStopSession()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [logModalOpen, setLogModalOpen] = useState(false)

  // Split sessions into active (running) and recent (not running)
  const { activeSessions, recentSessions } = useMemo(() => {
    if (!sessions) {
      return { activeSessions: [], recentSessions: [] }
    }

    const active: Session[] = []
    const recent: Session[] = []

    for (const session of sessions) {
      if (session.status === 'running') {
        active.push(session)
      } else {
        recent.push(session)
      }
    }

    // Sort recent by startedAt descending and limit to 10
    recent.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    const limitedRecent = recent.slice(0, 10)

    return { activeSessions: active, recentSessions: limitedRecent }
  }, [sessions])

  const handleStopSession = (sessionId: string) => {
    stopSession.mutate(sessionId)
  }

  const handleViewLog = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setLogModalOpen(true)
  }

  const handleCloseLogModal = () => {
    setLogModalOpen(false)
    setSelectedSessionId(null)
  }

  if (isLoading) {
    return (
      <div className="p-4 text-text-primary">
        <h2 className="text-xl font-semibold mb-4">Sessions</h2>
        <div className="text-text-muted">Loading sessions...</div>
      </div>
    )
  }

  return (
    <div className="p-4 text-text-primary">
      {/* Active Sessions Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Active Sessions
          <span className="text-sm font-normal text-text-muted">
            ({activeSessions.length})
          </span>
          {activeSessions.length > 0 && (
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </h2>

        {activeSessions.length === 0 ? (
          <div className="bg-bg-secondary rounded-lg p-6 text-center text-text-muted border border-border">
            No active sessions
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onStop={handleStopSession}
                onViewLog={handleViewLog}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Sessions Section */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Recent Sessions
          <span className="text-sm font-normal text-text-muted">
            ({recentSessions.length})
          </span>
        </h2>

        {recentSessions.length === 0 ? (
          <div className="bg-bg-secondary rounded-lg p-6 text-center text-text-muted border border-border">
            No recent sessions
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onStop={handleStopSession}
                onViewLog={handleViewLog}
              />
            ))}
          </div>
        )}
      </section>

      {/* Session Log Modal */}
      <SessionLogModal
        sessionId={selectedSessionId}
        open={logModalOpen}
        onClose={handleCloseLogModal}
      />
    </div>
  )
}
