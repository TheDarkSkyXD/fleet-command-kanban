import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskList } from './TaskList'
import type { Task } from '@fleet-command/shared'

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  ticketId: 'FC-1',
  displayNumber: 1,
  phase: 'Build',
  status: 'pending',
  attemptCount: 0,
  description: 'A test task',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('TaskList', () => {
  it('renders all tasks', () => {
    const tasks = [
      makeTask({ id: '1', description: 'Task one' }),
      makeTask({ id: '2', description: 'Task two' }),
      makeTask({ id: '3', description: 'Task three' }),
    ]
    render(<TaskList tasks={tasks} />)
    expect(screen.getByText('Task one')).toBeTruthy()
    expect(screen.getByText('Task two')).toBeTruthy()
    expect(screen.getByText('Task three')).toBeTruthy()
  })

  it('renders completed tasks with line-through styling', () => {
    const tasks = [makeTask({ status: 'completed', description: 'Done task' })]
    render(<TaskList tasks={tasks} />)
    const text = screen.getByText('Done task')
    expect(text.className).toContain('line-through')
  })

  it('renders failed tasks with destructive styling', () => {
    const tasks = [makeTask({ status: 'failed', description: 'Failed task' })]
    render(<TaskList tasks={tasks} />)
    const text = screen.getByText('Failed task')
    expect(text.className).toContain('text-destructive')
  })

  it('calls onTaskClick when a task is clicked', async () => {
    const onClick = vi.fn()
    const task = makeTask({ description: 'Clickable task' })
    render(<TaskList tasks={[task]} onTaskClick={onClick} />)

    await userEvent.click(screen.getByText('Clickable task'))
    expect(onClick).toHaveBeenCalledWith(task)
  })

  it('renders empty list when no tasks', () => {
    const { container } = render(<TaskList tasks={[]} />)
    const ul = container.querySelector('ul')
    expect(ul?.children.length).toBe(0)
  })
})
