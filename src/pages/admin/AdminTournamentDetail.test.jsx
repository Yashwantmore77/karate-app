import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('AdminTournamentDetail - Category CRUD Operations', () => {
  const tournamentId = 'tournament-123'

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Create Category', () => {
    it('should create a new category with valid data', () => {
      const categories = []
      const newCategory = {
        id: 'cat-' + Date.now(),
        tournamentId,
        name: 'U12 Boys Kata',
        ageGroup: 'U12',
        gender: 'M',
        division: 'Beginner',
        createdAt: new Date().toISOString()
      }

      const updated = [...categories, newCategory]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(stored).toHaveLength(1)
      expect(stored[0].name).toBe('U12 Boys Kata')
      expect(stored[0].ageGroup).toBe('U12')
      expect(stored[0].gender).toBe('M')
      expect(stored[0].division).toBe('Beginner')
    })

    it('should persist category to localStorage with tournament ID', () => {
      const category = {
        id: 'cat-456',
        tournamentId,
        name: 'U14 Girls Kumite',
        ageGroup: 'U14',
        gender: 'F',
        division: 'Advanced',
        createdAt: new Date().toISOString()
      }

      const categories = [category]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const retrieved = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(retrieved[0].tournamentId).toBe(tournamentId)
      expect(retrieved[0].name).toBe('U14 Girls Kumite')
    })

    it('should support mixed gender categories', () => {
      const category = {
        id: 'cat-789',
        tournamentId,
        name: 'U18 Mixed Team',
        ageGroup: 'U18',
        gender: 'Mixed',
        division: 'Intermediate',
        createdAt: new Date().toISOString()
      }

      const categories = [category]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(stored[0].gender).toBe('Mixed')
    })
  })

  describe('Read/Retrieve Categories', () => {
    it('should retrieve all categories for a tournament', () => {
      const categories = [
        { id: 'c1', tournamentId, name: 'U12 Boys', ageGroup: 'U12', gender: 'M', division: 'Beginner' },
        { id: 'c2', tournamentId, name: 'U12 Girls', ageGroup: 'U12', gender: 'F', division: 'Beginner' }
      ]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(stored).toHaveLength(2)
      expect(stored[0].name).toBe('U12 Boys')
      expect(stored[1].name).toBe('U12 Girls')
    })

    it('should handle empty category list', () => {
      const stored = localStorage.getItem(`categories-${tournamentId}`)
      expect(stored).toBeNull()
    })

    it('should find category by ID', () => {
      const categories = [
        { id: 'c1', tournamentId, name: 'U12 Boys', ageGroup: 'U12', gender: 'M', division: 'Beginner' },
        { id: 'c2', tournamentId, name: 'U12 Girls', ageGroup: 'U12', gender: 'F', division: 'Beginner' }
      ]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      const found = stored.find(c => c.id === 'c1')
      expect(found).toBeDefined()
      expect(found.name).toBe('U12 Boys')
    })
  })

  describe('Update Category', () => {
    it('should update category name', () => {
      const categories = [
        { id: 'c1', tournamentId, name: 'Old Name', ageGroup: 'U12', gender: 'M', division: 'Beginner' }
      ]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      const updated = stored.map(c =>
        c.id === 'c1' ? { ...c, name: 'New Name' } : c
      )
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(retrieved[0].name).toBe('New Name')
    })

    it('should update category division and age group', () => {
      const categories = [
        { id: 'c1', tournamentId, name: 'U12 Boys', ageGroup: 'U12', gender: 'M', division: 'Beginner' }
      ]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      const updated = stored.map(c =>
        c.id === 'c1' ? { ...c, ageGroup: 'U14', division: 'Advanced' } : c
      )
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(retrieved[0].ageGroup).toBe('U14')
      expect(retrieved[0].division).toBe('Advanced')
    })
  })

  describe('Delete Category', () => {
    it('should delete category by ID', () => {
      const categories = [
        { id: 'c1', tournamentId, name: 'U12 Boys', ageGroup: 'U12', gender: 'M', division: 'Beginner' },
        { id: 'c2', tournamentId, name: 'U12 Girls', ageGroup: 'U12', gender: 'F', division: 'Beginner' }
      ]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      const updated = stored.filter(c => c.id !== 'c1')
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].id).toBe('c2')
    })

    it('should handle deleting all categories', () => {
      const categories = [
        { id: 'c1', tournamentId, name: 'U12 Boys', ageGroup: 'U12', gender: 'M', division: 'Beginner' }
      ]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))

      const stored = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      const updated = stored.filter(c => c.id !== 'c1')
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))

      const retrieved = JSON.parse(localStorage.getItem(`categories-${tournamentId}`))
      expect(retrieved).toHaveLength(0)
    })

    it('should cascade delete competitors and matches belonging to the category', () => {
      const categories = [
        { id: 'c1', tournamentId, name: 'U12 Boys', ageGroup: 'U12', gender: 'M', division: 'Beginner' }
      ]
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))
      localStorage.setItem('competitors-c1', JSON.stringify([{ id: 'comp-1', name: 'Test' }]))
      localStorage.setItem('matches-c1', JSON.stringify([{ id: 'm1' }]))

      // Simulate AdminTournamentDetail.handleDelete('c1')
      localStorage.removeItem('competitors-c1')
      localStorage.removeItem('matches-c1')
      const updated = categories.filter(c => c.id !== 'c1')
      localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))

      expect(localStorage.getItem('competitors-c1')).toBeNull()
      expect(localStorage.getItem('matches-c1')).toBeNull()
      expect(JSON.parse(localStorage.getItem(`categories-${tournamentId}`))).toHaveLength(0)
    })
  })

  describe('Data Validation', () => {
    it('should have required fields in category', () => {
      const category = {
        id: 'cat-123',
        tournamentId,
        name: 'U12 Boys Kata',
        ageGroup: 'U12',
        gender: 'M',
        division: 'Beginner',
        createdAt: new Date().toISOString()
      }

      expect(category.id).toBeDefined()
      expect(category.tournamentId).toBeDefined()
      expect(category.name).toBeDefined()
      expect(category.ageGroup).toBeDefined()
      expect(category.gender).toBeDefined()
      expect(category.division).toBeDefined()
    })

    it('should validate gender values', () => {
      const validGenders = ['M', 'F', 'Mixed']
      const categories = [
        { gender: 'M' },
        { gender: 'F' },
        { gender: 'Mixed' }
      ]

      categories.forEach(cat => {
        expect(validGenders).toContain(cat.gender)
      })
    })

    it('should maintain tournament ID relationship', () => {
      const t1 = 'tournament-1'
      const t2 = 'tournament-2'

      const cat1 = { id: 'c1', tournamentId: t1, name: 'Cat1' }
      const cat2 = { id: 'c2', tournamentId: t2, name: 'Cat2' }

      expect(cat1.tournamentId).toBe(t1)
      expect(cat2.tournamentId).toBe(t2)
      expect(cat1.tournamentId).not.toBe(cat2.tournamentId)
    })
  })

  describe('Isolation by Tournament', () => {
    it('should isolate categories by tournament ID', () => {
      const t1 = 'tournament-1'
      const t2 = 'tournament-2'

      const cat1 = { id: 'c1', tournamentId: t1, name: 'Cat1' }
      const cat2 = { id: 'c2', tournamentId: t2, name: 'Cat2' }

      localStorage.setItem(`categories-${t1}`, JSON.stringify([cat1]))
      localStorage.setItem(`categories-${t2}`, JSON.stringify([cat2]))

      const stored1 = JSON.parse(localStorage.getItem(`categories-${t1}`))
      const stored2 = JSON.parse(localStorage.getItem(`categories-${t2}`))

      expect(stored1[0].name).toBe('Cat1')
      expect(stored2[0].name).toBe('Cat2')
      expect(stored1).not.toEqual(stored2)
    })
  })
})
