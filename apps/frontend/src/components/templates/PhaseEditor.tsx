import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { AgentCard } from './AgentCard'
import { getAutomationType, generateAgentId, type AutomationType } from './template.utils'
import { cn } from '@/lib/utils'
import type { TemplatePhase, TemplateAgent, RalphLoopConfig, TicketLoopConfig } from '@fleet-command/shared'

interface PhaseEditorProps {
  phase: TemplatePhase
  templateName: string
  isLocked: boolean
  onChange: (phase: TemplatePhase) => void
}

/**
 * Generate phase ID from name
 */
function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Create a new empty agent
 */
function createNewAgent(): TemplateAgent {
  return {
    id: generateAgentId(),
    type: '',
    role: 'primary',
    description: '',
    prompt: ''
  }
}

/**
 * Right-column editor for a selected phase
 */
export function PhaseEditor({
  phase,
  templateName,
  isLocked,
  onChange
}: PhaseEditorProps) {
  const automationType = getAutomationType(phase)

  const handleNameChange = (name: string) => {
    onChange({
      ...phase,
      name,
      id: generateId(name)
    })
  }

  const handleAutomationTypeChange = (type: AutomationType) => {
    // Clear existing automation config when switching types
    const newPhase: TemplatePhase = {
      ...phase,
      agents: undefined,
      ralphLoop: undefined,
      ticketLoop: undefined
    }

    switch (type) {
      case 'agents':
        newPhase.agents = []
        break
      case 'ralph-loop':
        newPhase.ralphLoop = {
          loopId: '',
          maxAttempts: 3,
          agents: []
        }
        break
      case 'ticket-loop':
        newPhase.ticketLoop = {
          loopId: '',
          input: [],
          agents: []
        }
        break
      // 'manual' - no config needed
    }

    onChange(newPhase)
  }

  const handleAgentChange = (index: number, agent: TemplateAgent) => {
    const newAgents = [...(phase.agents ?? [])]
    newAgents[index] = agent
    onChange({ ...phase, agents: newAgents })
  }

  const handleAgentDelete = (index: number) => {
    const newAgents = [...(phase.agents ?? [])]
    newAgents.splice(index, 1)
    onChange({ ...phase, agents: newAgents })
  }

  const handleAddAgent = () => {
    onChange({
      ...phase,
      agents: [...(phase.agents ?? []), createNewAgent()]
    })
  }

  // Ralph Loop handlers
  const handleRalphLoopChange = (updates: Partial<RalphLoopConfig>) => {
    onChange({
      ...phase,
      ralphLoop: { ...phase.ralphLoop!, ...updates }
    })
  }

  const handleRalphLoopAgentChange = (index: number, agent: TemplateAgent) => {
    const newAgents = [...(phase.ralphLoop?.agents ?? [])]
    newAgents[index] = agent
    handleRalphLoopChange({ agents: newAgents })
  }

  const handleRalphLoopAgentDelete = (index: number) => {
    const newAgents = [...(phase.ralphLoop?.agents ?? [])]
    newAgents.splice(index, 1)
    handleRalphLoopChange({ agents: newAgents })
  }

  const handleAddRalphLoopAgent = () => {
    handleRalphLoopChange({
      agents: [...(phase.ralphLoop?.agents ?? []), createNewAgent()]
    })
  }

  // Ticket Loop handlers
  const handleTicketLoopChange = (updates: Partial<TicketLoopConfig>) => {
    onChange({
      ...phase,
      ticketLoop: { ...phase.ticketLoop!, ...updates }
    })
  }

  const handleTicketLoopAgentChange = (index: number, agent: TemplateAgent) => {
    const newAgents = [...(phase.ticketLoop?.agents ?? [])]
    newAgents[index] = agent
    handleTicketLoopChange({ agents: newAgents })
  }

  const handleTicketLoopAgentDelete = (index: number) => {
    const newAgents = [...(phase.ticketLoop?.agents ?? [])]
    newAgents.splice(index, 1)
    handleTicketLoopChange({ agents: newAgents })
  }

  const handleAddTicketLoopAgent = () => {
    handleTicketLoopChange({
      agents: [...(phase.ticketLoop?.agents ?? []), createNewAgent()]
    })
  }

  const handleToggleTicketLoopRalphLoop = (enabled: boolean) => {
    if (enabled) {
      handleTicketLoopChange({
        ralphLoop: {
          loopId: '',
          maxAttempts: 3,
          agents: []
        }
      })
    } else {
      handleTicketLoopChange({ ralphLoop: undefined })
    }
  }

  const handleTicketLoopRalphLoopChange = (updates: Partial<RalphLoopConfig>) => {
    handleTicketLoopChange({
      ralphLoop: { ...phase.ticketLoop?.ralphLoop!, ...updates }
    })
  }

  const handleTicketLoopRalphLoopAgentChange = (index: number, agent: TemplateAgent) => {
    const newAgents = [...(phase.ticketLoop?.ralphLoop?.agents ?? [])]
    newAgents[index] = agent
    handleTicketLoopRalphLoopChange({ agents: newAgents })
  }

  const handleTicketLoopRalphLoopAgentDelete = (index: number) => {
    const newAgents = [...(phase.ticketLoop?.ralphLoop?.agents ?? [])]
    newAgents.splice(index, 1)
    handleTicketLoopRalphLoopChange({ agents: newAgents })
  }

  const handleAddTicketLoopRalphLoopAgent = () => {
    handleTicketLoopRalphLoopChange({
      agents: [...(phase.ticketLoop?.ralphLoop?.agents ?? []), createNewAgent()]
    })
  }

  return (
    <div className="space-y-6">
      {/* Phase Info Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Phase Info</h3>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={phase.name}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={isLocked}
              placeholder="Phase name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ID (auto-generated)</label>
            <Input
              value={phase.id}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={phase.description ?? ''}
              onChange={(e) => onChange({ ...phase, description: e.target.value })}
              disabled={isLocked}
              placeholder="Describe what happens in this phase..."
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={phase.requiresWorktree ?? false}
                onChange={(e) => onChange({ ...phase, requiresWorktree: e.target.checked })}
                disabled={isLocked}
                className="rounded border-input"
              />
              <span className="text-sm">Requires Git Worktree</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={phase.transitions?.manual ?? false}
                onChange={(e) => onChange({
                  ...phase,
                  transitions: { ...phase.transitions, manual: e.target.checked }
                })}
                disabled={isLocked}
                className="rounded border-input"
              />
              <span className="text-sm">Manual Trigger Only</span>
            </label>
          </div>
        </div>
      </section>

      <Separator />

      {/* Automation Type Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Automation Type</h3>

        <div className="space-y-2">
          <AutomationRadio
            value="manual"
            selected={automationType}
            onChange={handleAutomationTypeChange}
            disabled={isLocked}
            label="Manual"
            description="No automation - phase advances manually"
          />
          <AutomationRadio
            value="agents"
            selected={automationType}
            onChange={handleAutomationTypeChange}
            disabled={isLocked}
            label="Agents"
            description="Run agents sequentially in this phase"
          />
          <AutomationRadio
            value="ralph-loop"
            selected={automationType}
            onChange={handleAutomationTypeChange}
            disabled={isLocked}
            label="Ralph Loop"
            description="Run agents in a feedback loop until validation passes"
          />
          <AutomationRadio
            value="ticket-loop"
            selected={automationType}
            onChange={handleAutomationTypeChange}
            disabled={isLocked}
            label="Ticket Loop"
            description="Create sub-tickets from input artifacts and process each"
          />
        </div>
      </section>

      <Separator />

      {/* Automation Config Section */}
      {automationType !== 'manual' && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">Automation Config</h3>

          {automationType === 'agents' && (
            <AgentsList
              agents={phase.agents ?? []}
              templateName={templateName}
              onChange={handleAgentChange}
              onDelete={handleAgentDelete}
              onAdd={handleAddAgent}
            />
          )}

          {automationType === 'ralph-loop' && phase.ralphLoop && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Loop ID</label>
                  <Input
                    value={phase.ralphLoop.loopId}
                    onChange={(e) => handleRalphLoopChange({ loopId: e.target.value })}
                    placeholder="loop-id"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Max Attempts</label>
                  <Input
                    type="number"
                    value={phase.ralphLoop.maxAttempts}
                    onChange={(e) => handleRalphLoopChange({ maxAttempts: parseInt(e.target.value) || 3 })}
                    min={1}
                    max={10}
                  />
                </div>
              </div>

              <AgentsList
                agents={phase.ralphLoop.agents ?? []}
                templateName={templateName}
                onChange={handleRalphLoopAgentChange}
                onDelete={handleRalphLoopAgentDelete}
                onAdd={handleAddRalphLoopAgent}
              />
            </div>
          )}

          {automationType === 'ticket-loop' && phase.ticketLoop && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Loop ID</label>
                <Input
                  value={phase.ticketLoop.loopId}
                  onChange={(e) => handleTicketLoopChange({ loopId: e.target.value })}
                  placeholder="ticket-loop-id"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Input Artifacts</label>
                <Input
                  value={phase.ticketLoop.input.join(', ')}
                  onChange={(e) => handleTicketLoopChange({
                    input: e.target.value ? e.target.value.split(',').map(s => s.trim()) : []
                  })}
                  placeholder="Comma-separated artifact names"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!phase.ticketLoop.ralphLoop}
                  onChange={(e) => handleToggleTicketLoopRalphLoop(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-sm">Use Ralph Loop for each ticket</span>
              </label>

              {phase.ticketLoop.ralphLoop && (
                <div className="ml-4 pl-4 border-l space-y-4">
                  <h4 className="text-xs font-medium text-muted-foreground">Inner Ralph Loop</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Loop ID</label>
                      <Input
                        value={phase.ticketLoop.ralphLoop.loopId}
                        onChange={(e) => handleTicketLoopRalphLoopChange({ loopId: e.target.value })}
                        placeholder="inner-loop-id"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Max Attempts</label>
                      <Input
                        type="number"
                        value={phase.ticketLoop.ralphLoop.maxAttempts}
                        onChange={(e) => handleTicketLoopRalphLoopChange({ maxAttempts: parseInt(e.target.value) || 3 })}
                        min={1}
                        max={10}
                      />
                    </div>
                  </div>

                  <AgentsList
                    agents={phase.ticketLoop.ralphLoop.agents ?? []}
                    templateName={templateName}
                    onChange={handleTicketLoopRalphLoopAgentChange}
                    onDelete={handleTicketLoopRalphLoopAgentDelete}
                    onAdd={handleAddTicketLoopRalphLoopAgent}
                    label="Inner Loop Agents"
                  />
                </div>
              )}

              {!phase.ticketLoop.ralphLoop && (
                <AgentsList
                  agents={phase.ticketLoop.agents ?? []}
                  templateName={templateName}
                  onChange={handleTicketLoopAgentChange}
                  onDelete={handleTicketLoopAgentDelete}
                  onAdd={handleAddTicketLoopAgent}
                />
              )}
            </div>
          )}
        </section>
      )}

      {automationType !== 'manual' && <Separator />}

      {/* Output Artifacts Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Output Artifacts</h3>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Artifact Names</label>
          <Input
            value={phase.output?.artifacts?.join(', ') ?? ''}
            onChange={(e) => onChange({
              ...phase,
              output: {
                ...phase.output,
                artifacts: e.target.value ? e.target.value.split(',').map(s => s.trim()) : undefined
              }
            })}
            disabled={isLocked}
            placeholder="Comma-separated artifact names"
          />
        </div>
      </section>
    </div>
  )
}

/**
 * Radio button for automation type selection
 */
function AutomationRadio({
  value,
  selected,
  onChange,
  disabled,
  label,
  description
}: {
  value: AutomationType
  selected: AutomationType
  onChange: (value: AutomationType) => void
  disabled: boolean
  label: string
  description: string
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
        selected === value ? 'border-primary bg-primary/5' : 'hover:border-primary/30',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input
        type="radio"
        name="automation-type"
        value={value}
        checked={selected === value}
        onChange={() => onChange(value)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  )
}

/**
 * List of agent cards with add button
 */
function AgentsList({
  agents,
  templateName,
  onChange,
  onDelete,
  onAdd,
  label = 'Agents'
}: {
  agents: TemplateAgent[]
  templateName: string
  onChange: (index: number, agent: TemplateAgent) => void
  onDelete: (index: number) => void
  onAdd: () => void
  label?: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Button variant="ghost" size="xs" onClick={onAdd}>
          <Plus className="h-3 w-3" />
          Add Agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
          No agents configured
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent, index) => (
            <AgentCard
              key={agent.id ?? `agent-${index}`}
              agent={agent}
              templateName={templateName}
              onChange={(updated) => onChange(index, updated)}
              onDelete={() => onDelete(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
