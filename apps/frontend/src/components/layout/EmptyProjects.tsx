import { Plus, FolderOpen } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

export function EmptyProjects() {
  const openAddProjectModal = useAppStore((s) => s.openAddProjectModal)

  return (
    <div className="flex flex-col items-center pt-24 p-8">
      {/* Logo - large centered version */}
      <div className="brand-logo brand-logo--hero brand-logo--standard mb-8">
        <div className="brand-logo__icon">
          <svg viewBox="0 0 32 32" style={{ width: 48, height: 48 }}>
            <path d="M16 2 L28 7 L28 17 C28 24 22 29 16 31 C10 29 4 24 4 17 L4 7 Z" fill="rgba(96,165,250,0.15)" stroke="#60A5FA" strokeWidth="1.5" />
            <path d="M16 8 L22 14" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
            <path d="M16 8 L10 14" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
            <path d="M16 14 L23 21" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16 14 L9 21" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16 20 L24 28" stroke="#60A5FA" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
            <path d="M16 20 L8 28" stroke="#60A5FA" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
            <circle cx="16" cy="7" r="2" fill="#58a6ff" />
          </svg>
        </div>
        <div className="brand-logo__text">
          <span className="brand-logo__title">FLEET</span>
          <span className="brand-logo__subtitle">COMMAND</span>
        </div>
      </div>

      {/* Message */}
      <h2 className="text-xl font-semibold text-text-primary mb-2 text-center">
        Welcome to Fleet Command
      </h2>
      <p className="text-text-secondary mb-8 text-center max-w-md">
        Get started by creating your first project. Projects help you organize tickets and track progress with AI-powered automation.
      </p>

      {/* Actions - side by side */}
      <div className="flex gap-4">
        <button
          onClick={openAddProjectModal}
          className="flex flex-col items-center gap-3 p-6 rounded-lg bg-bg-secondary border border-border hover:border-accent hover:bg-bg-tertiary transition-colors min-w-[180px]"
        >
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
            <Plus className="h-6 w-6 text-accent" />
          </div>
          <div className="text-center">
            <div className="font-medium text-text-primary">Create New</div>
            <div className="text-sm text-text-muted">Start a fresh project</div>
          </div>
        </button>

        <button
          onClick={openAddProjectModal}
          className="flex flex-col items-center gap-3 p-6 rounded-lg bg-bg-secondary border border-border hover:border-accent hover:bg-bg-tertiary transition-colors min-w-[180px]"
        >
          <div className="w-12 h-12 rounded-full bg-accent-green/10 flex items-center justify-center">
            <FolderOpen className="h-6 w-6 text-accent-green" />
          </div>
          <div className="text-center">
            <div className="font-medium text-text-primary">Add Existing</div>
            <div className="text-sm text-text-muted">Import a project folder</div>
          </div>
        </button>
      </div>
    </div>
  )
}
