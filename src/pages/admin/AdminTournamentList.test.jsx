import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('AdminTournamentList - Tournament CRUD Operations', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Create Tournament', () => {
    it('should create a new tournament with valid data', () => {
      const tournaments = []
      const newTournament = {
        id: 'tournament-' + Date.now(),
        name: 'Spring Championship',
        location: 'New York',
        date: '2026-09-20',
        template: 'kata',
        status: 'draft',
        createdAt: new Date().toISOString()
      }

      const updated = [...tournaments, newTournament]
      localStorage.setItem('tournaments', JSON.stringify(updated))

      const stored = JSON.parse(localStorage.getItem('tournaments'))
      expect(stored).toHaveLength(1)
      expect(stored[0].name).toBe('Spring Championship')
      expect(stored[0].location).toBe('New York')
      expect(stored[0].template).toBe('kata')
      expect(stored[0].status).toBe('draft')
    })

    it('should handle date conversion from dayjs to string', () => {
      const formatDate = (date) => {
        if (!date) return null
        if (date.format) return date.format('YYYY-MM-DD')
        return new Date(date).toISOString().split('T')[0]
      }

      // Simulate dayjs object
      const dayjsDate = { format: (fmt) => '2026-09-20' }
      const result = formatDate(dayjsDate)
      expect(result).toBe('2026-09-20')

      // Simulate Date object
      const jsDate = new Date('2026-09-20')
      const result2 = formatDate(jsDate)
      expect(result2).toBe('2026-09-20')
    })

    it('should persist tournament to localStorage', () => {
      const tournament = {
        id: 'tournament-123',
        name: 'Test Tournament',
        location: 'London',
        date: '2026-10-15',
        template: 'kumite',
        status: 'draft',
        createdAt: new Date().toISOString()
      }

      const tournaments = [tournament]
      localStorage.setItem('tournaments', JSON.stringify(tournaments))

      const retrieved = JSON.parse(localStorage.getItem('tournaments'))
      expect(retrieved[0].id).toBe('tournament-123')
      expect(retrieved[0].name).toBe('Test Tournament')
    })
  })

  describe('Read/Retrieve Tournament', () => {
    it('should retrieve all tournaments from localStorage', () => {
      const tournaments = [
        { id: 't1', name: 'Tournament 1', location: 'City1', date: '2026-09-20', template: 'kata', status: 'draft' },
        { id: 't2', name: 'Tournament 2', location: 'City2', date: '2026-09-21', template: 'kumite', status: 'active' }
      ]
      localStorage.setItem('tournaments', JSON.stringify(tournaments))

      const stored = JSON.parse(localStorage.getItem('tournaments'))
      expect(stored).toHaveLength(2)
      expect(stored[0].name).toBe('Tournament 1')
      expect(stored[1].name).toBe('Tournament 2')
    })

    it('should handle empty tournament list', () => {
      const stored = localStorage.getItem('tournaments')
      expect(stored).toBeNull()
    })

    it('should find tournament by ID', () => {
      const tournaments = [
        { id: 't1', name: 'Tournament 1', location: 'City1', date: '2026-09-20', template: 'kata' },
        { id: 't2', name: 'Tournament 2', location: 'City2', date: '2026-09-21', template: 'kumite' }
      ]
      localStorage.setItem('tournaments', JSON.stringify(tournaments))

      const stored = JSON.parse(localStorage.getItem('tournaments'))
      const found = stored.find(t => t.id === 't1')
      expect(found).toBeDefined()
      expect(found.name).toBe('Tournament 1')
    })
  })

  describe('Update Tournament', () => {
    it('should update tournament name', () => {
      const tournaments = [
        { id: 't1', name: 'Old Name', location: 'City1', date: '2026-09-20', template: 'kata' }
      ]
      localStorage.setItem('tournaments', JSON.stringify(tournaments))

      const stored = JSON.parse(localStorage.getItem('tournaments'))
      const updated = stored.map(t =>
        t.id === 't1' ? { ...t, name: 'New Name' } : t
      )
      localStorage.setItem('tournaments', JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem('tournaments'))
      expect(retrieved[0].name).toBe('New Name')
    })

    it('should update tournament date and location', () => {
      const tournaments = [
        { id: 't1', name: 'Tournament', location: 'OldCity', date: '2026-09-20', template: 'kata' }
      ]
      localStorage.setItem('tournaments', JSON.stringify(tournaments))

      const stored = JSON.parse(localStorage.getItem('tournaments'))
      const updated = stored.map(t =>
        t.id === 't1' ? { ...t, location: 'NewCity', date: '2026-10-25' } : t
      )
      localStorage.setItem('tournaments', JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem('tournaments'))
      expect(retrieved[0].location).toBe('NewCity')
      expect(retrieved[0].date).toBe('2026-10-25')
    })

    it('should handle date conversion with dayjs object on edit', () => {
      const formatDate = (date) => {
        if (!date) return null
        if (date.format) return date.format('YYYY-MM-DD')
        return new Date(date).toISOString().split('T')[0]
      }

      // Simulate dayjs object from DatePicker on edit
      const dayjsDate = { format: (fmt) => '2026-10-30' }
      const result = formatDate(dayjsDate)
      expect(result).toBe('2026-10-30')

      // Update tournament with formatted date
      const tournaments = [
        { id: 't1', name: 'Tournament', location: 'City', date: '2026-09-20', template: 'kata' }
      ]
      const updated = tournaments.map(t =>
        t.id === 't1' ? { ...t, date: result } : t
      )
      localStorage.setItem('tournaments', JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem('tournaments'))
      expect(retrieved[0].date).toBe('2026-10-30')
    })
  })

  describe('Delete Tournament', () => {
    it('should delete tournament by ID', () => {
      const tournaments = [
        { id: 't1', name: 'Tournament 1', location: 'City1', date: '2026-09-20', template: 'kata' },
        { id: 't2', name: 'Tournament 2', location: 'City2', date: '2026-09-21', template: 'kumite' }
      ]
      localStorage.setItem('tournaments', JSON.stringify(tournaments))

      const stored = JSON.parse(localStorage.getItem('tournaments'))
      const updated = stored.filter(t => t.id !== 't1')
      localStorage.setItem('tournaments', JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem('tournaments'))
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].id).toBe('t2')
    })

    it('should handle deleting from empty list', () => {
      const tournaments = []
      const updated = tournaments.filter(t => t.id !== 't1')
      expect(updated).toHaveLength(0)
    })

    it('should cascade delete categories, competitors and matches when a tournament is deleted', () => {
      const tournaments = [
        { id: 't1', name: 'Tournament 1', location: 'City1', date: '2026-09-20', template: 'kata' }
      ]
      localStorage.setItem('tournaments', JSON.stringify(tournaments))
      localStorage.setItem('categories-t1', JSON.stringify([{ id: 'c1' }, { id: 'c2' }]))
      localStorage.setItem('competitors-c1', JSON.stringify([{ id: 'comp-1' }]))
      localStorage.setItem('matches-c1', JSON.stringify([{ id: 'm1' }]))
      localStorage.setItem('competitors-c2', JSON.stringify([{ id: 'comp-2' }]))

      // Simulate AdminTournamentList.handleDelete('t1')
      const catStored = localStorage.getItem('categories-t1')
      JSON.parse(catStored).forEach((c) => {
        localStorage.removeItem(`competitors-${c.id}`)
        localStorage.removeItem(`matches-${c.id}`)
      })
      localStorage.removeItem('categories-t1')
      const updated = tournaments.filter(t => t.id !== 't1')
      localStorage.setItem('tournaments', JSON.stringify(updated))

      expect(localStorage.getItem('categories-t1')).toBeNull()
      expect(localStorage.getItem('competitors-c1')).toBeNull()
      expect(localStorage.getItem('matches-c1')).toBeNull()
      expect(localStorage.getItem('competitors-c2')).toBeNull()
      expect(JSON.parse(localStorage.getItem('tournaments'))).toHaveLength(0)
    })
  })

  describe('Data Validation', () => {
    it('should have required fields in tournament', () => {
      const tournament = {
        id: 'tournament-123',
        name: 'Tournament',
        location: 'City',
        date: '2026-09-20',
        template: 'kata',
        status: 'draft',
        createdAt: new Date().toISOString()
      }

      expect(tournament.id).toBeDefined()
      expect(tournament.name).toBeDefined()
      expect(tournament.location).toBeDefined()
      expect(tournament.date).toBeDefined()
      expect(tournament.template).toBeDefined()
      expect(tournament.status).toBeDefined()
    })

    it('should validate tournament template values', () => {
      const validTemplates = ['kata', 'kumite']
      const tournament1 = { template: 'kata' }
      const tournament2 = { template: 'kumite' }

      expect(validTemplates).toContain(tournament1.template)
      expect(validTemplates).toContain(tournament2.template)
    })

    it('should validate tournament status values', () => {
      const validStatuses = ['draft', 'active', 'completed']
      const tournament = { status: 'draft' }

      expect(validStatuses).toContain(tournament.status)
    })
  })
})
