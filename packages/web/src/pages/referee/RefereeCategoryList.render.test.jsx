import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RefereeCategoryList from './RefereeCategoryList'

const seed = () => {
  const future = new Date()
  future.setFullYear(future.getFullYear() + 1)
  const futureDate = future.toISOString().split('T')[0]
  localStorage.setItem('tournaments', JSON.stringify([
    { id: 't-active', name: 'Spring Cup', location: 'NYC', date: futureDate, template: 'kata', status: 'active' },
    { id: 't-active-2', name: 'Autumn Cup', location: 'Chicago', date: futureDate, template: 'kata', status: 'active' },
    { id: 't-expired', name: 'Winter Cup', location: 'Boston', date: '2020-01-01', template: 'kumite', status: 'completed' },
  ]))
  localStorage.setItem('categories-t-active', JSON.stringify([
    { id: 'cat-1', tournamentId: 't-active', name: 'U12 Boys Kata', ageGroup: 'U12', gender: 'M', division: 'Beginner' }
  ]))
  localStorage.setItem('categories-t-active-2', JSON.stringify([
    { id: 'cat-3', tournamentId: 't-active-2', name: 'U16 Girls Kata', ageGroup: 'U16', gender: 'F', division: 'Advanced' }
  ]))
  localStorage.setItem('categories-t-expired', JSON.stringify([
    { id: 'cat-2', tournamentId: 't-expired', name: 'U14 Girls Kumite', ageGroup: 'U14', gender: 'F', division: 'Advanced' }
  ]))
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <RefereeCategoryList uid="ref-uid" />
    </MemoryRouter>
  )

describe('RefereeCategoryList - searchable tournament dropdown', () => {
  beforeEach(() => {
    localStorage.clear()
    seed()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('auto-selects the first non-expired tournament and shows its categories', () => {
    renderPage()
    expect(screen.getByText('U12 Boys Kata')).toBeInTheDocument()
  })

  it('filters options by typing into the dropdown', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = screen.getByLabelText(/select tournament/i)
    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Winter')

    expect(await screen.findByText('Winter Cup')).toBeInTheDocument()
    expect(screen.queryByText('Spring Cup')).not.toBeInTheDocument()
  })

  it('switches categories when a different active tournament is selected via search', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText('U12 Boys Kata')).toBeInTheDocument()

    const input = screen.getByLabelText(/select tournament/i)
    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Autumn')

    await user.click(await screen.findByRole('option', { name: /autumn cup/i }))

    expect(await screen.findByText('U16 Girls Kata')).toBeInTheDocument()
    expect(screen.queryByText('U12 Boys Kata')).not.toBeInTheDocument()
  })

  it('does not allow selecting the disabled (expired) option by clicking it', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = screen.getByLabelText(/select tournament/i)
    await user.click(input)

    const expiredOption = await screen.findByRole('option', { name: /winter cup/i })
    expect(expiredOption).toHaveStyle({ pointerEvents: 'none' })
  })

  it('marks the expired tournament option as disabled in the dropdown', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = screen.getByLabelText(/select tournament/i)
    await user.click(input)

    const expiredOption = await screen.findByRole('option', { name: /winter cup/i })
    expect(expiredOption).toHaveAttribute('aria-disabled', 'true')
  })
})
