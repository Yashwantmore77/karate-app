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
