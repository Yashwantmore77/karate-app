import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireAuth from './RequireAuth'

const renderWithRoute = (user) =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/admin"
          element={
            <RequireAuth user={user}>
              <div>Admin Content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>
  )

describe('RequireAuth', () => {
  it('redirects to /login when there is no user', () => {
    renderWithRoute(null)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })

  it('renders the protected content when a user is signed in', () => {
    renderWithRoute({ uid: 'user-1' })
    expect(screen.getByText('Admin Content')).toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })
})
