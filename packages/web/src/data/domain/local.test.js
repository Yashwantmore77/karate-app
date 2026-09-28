import { describe, it, expect, beforeEach } from 'vitest'
import { tournaments, categories, competitors, matches } from './local'

const stored = (key) => JSON.parse(localStorage.getItem(key) || 'null')

beforeEach(() => localStorage.clear())

describe('local domain storage', () => {
  it('writes tournaments to the key the rest of the app already reads', async () => {
    const created = await tournaments.create({
      name: 'Spring Cup', location: 'Pune', date: '2026-05-15', template: 'kumite',
    })

    // The key name is the on-disk format for every existing installation, so
    // this assertion is deliberately about the key and not just the result.
    expect(stored('tournaments')).toHaveLength(1)
    expect(stored('tournaments')[0]).toMatchObject({ id: created.id, name: 'Spring Cup', status: 'draft' })
    expect(created.createdAt).toBeTruthy()
  })

  it('keeps an explicit status instead of forcing draft', async () => {
    const created = await tournaments.create({ name: 'Old Cup', status: 'completed' })
    expect(created.status).toBe('completed')
  })

  it('reads, patches and deletes a tournament', async () => {
    const created = await tournaments.create({ name: 'Spring Cup' })
    expect(await tournaments.get(created.id)).toMatchObject({ name: 'Spring Cup' })

    const patched = await tournaments.update(created.id, { status: 'active' })
    expect(patched).toMatchObject({ name: 'Spring Cup', status: 'active' })

    await tournaments.remove(created.id)
    expect(await tournaments.get(created.id)).toBeNull()
    expect(stored('tournaments')).toEqual([])
  })

  it('returns null for an id that is not there', async () => {
    expect(await tournaments.get('nope')).toBeNull()
  })

  it('scopes categories to their tournament', async () => {
    await categories.create('t1', { name: 'U14 Boys' })
    await categories.create('t2', { name: 'U16 Girls' })

    expect(stored('categories-t1')).toHaveLength(1)
    expect(await categories.list('t1')).toHaveLength(1)
    expect((await categories.list('t1'))[0]).toMatchObject({ name: 'U14 Boys', tournamentId: 't1' })
    expect(await categories.list('t2')).toHaveLength(1)
  })

  it('reports an empty list for a tournament with no categories', async () => {
    expect(await categories.list('never-seen')).toEqual([])
  })

  it('scopes competitors and matches to their category', async () => {
    await competitors.create('c1', { name: 'Aiden Parker', bib: '101', age: 13 })
    await matches.create('c1', { redId: 'comp-1', blueId: 'comp-2' })

    expect(stored('competitors-c1')).toHaveLength(1)
    expect(stored('matches-c1')).toHaveLength(1)
    expect((await matches.list('c1'))[0]).toMatchObject({ categoryId: 'c1', redId: 'comp-1' })
  })

  it('keeps a bib exactly as entered', async () => {
    const created = await competitors.create('c1', { name: 'Aiden Parker', bib: '007', age: 13 })
    expect(created.bib).toBe('007')
  })

  it('deleting a tournament clears its categories and everything under them', async () => {
    const tournament = await tournaments.create({ name: 'Spring Cup' })
    const first = await categories.create(tournament.id, { name: 'U14 Boys' })
    const second = await categories.create(tournament.id, { name: 'U16 Girls' })
    await competitors.create(first.id, { name: 'Aiden Parker', bib: '101', age: 13 })
    await competitors.create(second.id, { name: 'Emma Wilson', bib: '201', age: 15 })
    await matches.create(first.id, { redId: 'r', blueId: 'b' })

    await tournaments.remove(tournament.id)

    // Orphaned keys would be unreachable from any screen and never cleaned up.
    expect(localStorage.getItem(`categories-${tournament.id}`)).toBeNull()
    expect(localStorage.getItem(`competitors-${first.id}`)).toBeNull()
    expect(localStorage.getItem(`competitors-${second.id}`)).toBeNull()
    expect(localStorage.getItem(`matches-${first.id}`)).toBeNull()
  })

  it('deleting a category clears its competitors and matches', async () => {
    const category = await categories.create('t1', { name: 'U14 Boys' })
    await competitors.create(category.id, { name: 'Aiden Parker', bib: '101', age: 13 })
    await matches.create(category.id, { redId: 'r', blueId: 'b' })

    await categories.remove('t1', category.id)

    expect(localStorage.getItem(`competitors-${category.id}`)).toBeNull()
    expect(localStorage.getItem(`matches-${category.id}`)).toBeNull()
    expect(await categories.list('t1')).toEqual([])
  })

  it('survives a corrupted value rather than throwing', async () => {
    localStorage.setItem('tournaments', 'not json')
    expect(await tournaments.list()).toEqual([])
  })

  describe('paging and search', () => {
    const enter = (n) => competitors.create('c1', { name: `Athlete ${String(n).padStart(2, '0')}`, bib: `${100 + n}`, age: 13 })

    it('returns one page with the total behind it', async () => {
      for (let i = 1; i <= 30; i += 1) await enter(i)
      const first = await competitors.page('c1', { page: 1, limit: 10 })

      expect(first.rows).toHaveLength(10)
      expect(first.total).toBe(30)
      expect(first.pages).toBe(3)
    })

    it('does not repeat a row between pages', async () => {
      for (let i = 1; i <= 30; i += 1) await enter(i)
      const a = await competitors.page('c1', { page: 1, limit: 10 })
      const b = await competitors.page('c1', { page: 2, limit: 10 })
      expect(a.rows.filter((x) => b.rows.some((y) => y.id === x.id))).toEqual([])
    })

    it('searches the fields the API searches, ignoring case', async () => {
      await competitors.create('c1', { name: 'Aarav Deshmukh', bib: '101', age: 13 })
      await competitors.create('c1', { name: 'Rohan Kulkarni', bib: '102', age: 13 })

      expect((await competitors.page('c1', { q: 'AARAV' })).total).toBe(1)
      expect((await competitors.page('c1', { q: '102' })).total).toBe(1)
      expect((await competitors.page('c1', { q: 'nobody' })).total).toBe(0)
    })

    it('reports one page even when nothing matches', async () => {
      const empty = await competitors.page('c1', { q: 'nothing' })
      expect(empty).toMatchObject({ total: 0, pages: 1 })
      expect(empty.rows).toEqual([])
    })

    it('pages tournaments and categories on their own fields', async () => {
      await tournaments.create({ name: 'Spring Cup', location: 'Pune' })
      await tournaments.create({ name: 'Winter Cup', location: 'Mumbai' })
      expect((await tournaments.page({ q: 'mumbai' })).total).toBe(1)

      await categories.create('t1', { name: 'U14 Boys', ageGroup: 'U14', division: 'Beginner' })
      expect((await categories.page('t1', { q: 'u14' })).total).toBe(1)
    })
  })

  it('gives every row a distinct id', async () => {
    const ids = new Set()
    for (let i = 0; i < 50; i += 1) {
      ids.add((await competitors.create('c1', { name: `Athlete ${i}`, bib: `${i}`, age: 12 })).id)
    }
    expect(ids.size).toBe(50)
  })
})
