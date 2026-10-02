import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireRole from './RequireRole'

const renderWithRoute = (profile) =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/referee" element={<div>Referee Home</div>} />
        <Route
          path="/admin"
          element={
            <RequireRole role="admin" profile={profile}>
              <div>Admin Content</div>
            </RequireRole>
          }
        />
      </Routes>
    </MemoryRouter>
  )

describe('RequireRole', () => {
  it('renders the content when the profile role matches', () => {
    renderWithRoute({ role: 'admin' })
    expect(screen.getByText('Admin Content')).toBeInTheDocument()
  })

  it('redirects to the role-appropriate home when the role does not match', () => {
    renderWithRoute({ role: 'referee' })
    expect(screen.getByText('Referee Home')).toBeInTheDocument()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })
})

describe('RequireRole with several roles', () => {
  const renderReferee = (profile) =>
    render(
      <MemoryRouter initialEntries={['/referee']}>
        <Routes>
          <Route path="/judge" element={<div>Judge Home</div>} />
          <Route
            path="/referee"
            element={
              <RequireRole role={['referee', 'admin']} profile={profile}>
                <div>Match Screens</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>
    )

  it('lets an admin into the referee section', () => {
    // The API already lets an admin do anything a referee can, and match
    // deletion is admin-only, so refusing them here hid it entirely.
    renderReferee({ role: 'admin' })
    expect(screen.getByText('Match Screens')).toBeInTheDocument()
  })

  it('still lets the referee in', () => {
    renderReferee({ role: 'referee' })
    expect(screen.getByText('Match Screens')).toBeInTheDocument()
  })

  it('still turns a judge away', () => {
    renderReferee({ role: 'judge' })
    expect(screen.getByText('Judge Home')).toBeInTheDocument()
    expect(screen.queryByText('Match Screens')).not.toBeInTheDocument()
  })
})
