import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './appStore'

describe('appStore - pendingTickets', () => {
  beforeEach(() => {
    useAppStore.setState({
      pendingTickets: new Map(),
    })
  })

  it('should return false for non-pending ticket', () => {
    const result = useAppStore.getState().isTicketPending('proj-1', 'ticket-1')
    expect(result).toBe(false)
  })

  it('should add a pending ticket', () => {
    useAppStore.getState().addPendingTicket('proj-1', 'ticket-1')
    expect(useAppStore.getState().isTicketPending('proj-1', 'ticket-1')).toBe(true)
  })

  it('should not affect other tickets when adding', () => {
    useAppStore.getState().addPendingTicket('proj-1', 'ticket-1')
    expect(useAppStore.getState().isTicketPending('proj-1', 'ticket-2')).toBe(false)
  })

  it('should not affect other projects when adding', () => {
    useAppStore.getState().addPendingTicket('proj-1', 'ticket-1')
    expect(useAppStore.getState().isTicketPending('proj-2', 'ticket-1')).toBe(false)
  })

  it('should remove a pending ticket', () => {
    useAppStore.getState().addPendingTicket('proj-1', 'ticket-1')
    useAppStore.getState().removePendingTicket('proj-1', 'ticket-1')
    expect(useAppStore.getState().isTicketPending('proj-1', 'ticket-1')).toBe(false)
  })

  it('should set pending tickets for a project (replacing existing)', () => {
    useAppStore.getState().addPendingTicket('proj-1', 'ticket-old')
    useAppStore.getState().setPendingTickets('proj-1', ['ticket-1', 'ticket-2'])

    expect(useAppStore.getState().isTicketPending('proj-1', 'ticket-1')).toBe(true)
    expect(useAppStore.getState().isTicketPending('proj-1', 'ticket-2')).toBe(true)
    expect(useAppStore.getState().isTicketPending('proj-1', 'ticket-old')).toBe(false)
  })

  it('should handle removing from non-existent project gracefully', () => {
    useAppStore.getState().removePendingTicket('nonexistent', 'ticket-1')
    expect(useAppStore.getState().isTicketPending('nonexistent', 'ticket-1')).toBe(false)
  })
})

describe('appStore - ticketActivity', () => {
  beforeEach(() => {
    useAppStore.setState({
      ticketActivity: new Map(),
    })
  })

  it('should return undefined for ticket with no activity', () => {
    const result = useAppStore.getState().getTicketActivity('proj-1', 'ticket-1')
    expect(result).toBeUndefined()
  })

  it('should set activity for a ticket', () => {
    useAppStore.getState().setTicketActivity('proj-1', 'ticket-1', 'Reading documentation')
    expect(useAppStore.getState().getTicketActivity('proj-1', 'ticket-1')).toBe('Reading documentation')
  })

  it('should not affect other tickets when setting activity', () => {
    useAppStore.getState().setTicketActivity('proj-1', 'ticket-1', 'Reading documentation')
    expect(useAppStore.getState().getTicketActivity('proj-1', 'ticket-2')).toBeUndefined()
  })

  it('should not affect other projects when setting activity', () => {
    useAppStore.getState().setTicketActivity('proj-1', 'ticket-1', 'Reading documentation')
    expect(useAppStore.getState().getTicketActivity('proj-2', 'ticket-1')).toBeUndefined()
  })

  it('should update activity for the same ticket', () => {
    useAppStore.getState().setTicketActivity('proj-1', 'ticket-1', 'Reading documentation')
    useAppStore.getState().setTicketActivity('proj-1', 'ticket-1', 'Making code changes')
    expect(useAppStore.getState().getTicketActivity('proj-1', 'ticket-1')).toBe('Making code changes')
  })

  it('should clear activity for a ticket', () => {
    useAppStore.getState().setTicketActivity('proj-1', 'ticket-1', 'Reading documentation')
    useAppStore.getState().clearTicketActivity('proj-1', 'ticket-1')
    expect(useAppStore.getState().getTicketActivity('proj-1', 'ticket-1')).toBeUndefined()
  })

  it('should handle clearing from non-existent project gracefully', () => {
    useAppStore.getState().clearTicketActivity('nonexistent', 'ticket-1')
    expect(useAppStore.getState().getTicketActivity('nonexistent', 'ticket-1')).toBeUndefined()
  })

  it('should track activity independently across multiple projects', () => {
    useAppStore.getState().setTicketActivity('proj-1', 'ticket-1', 'Reading documentation')
    useAppStore.getState().setTicketActivity('proj-2', 'ticket-1', 'Making code changes')
    expect(useAppStore.getState().getTicketActivity('proj-1', 'ticket-1')).toBe('Reading documentation')
    expect(useAppStore.getState().getTicketActivity('proj-2', 'ticket-1')).toBe('Making code changes')
  })
})
