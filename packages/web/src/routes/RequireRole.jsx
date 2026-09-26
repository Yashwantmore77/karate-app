import { Navigate } from 'react-router-dom'

// Explicit guard: renders children only if profile.role matches the required role,
// otherwise redirects to the section that actually belongs to this user's role.
export default function RequireRole({ role, profile, children }) {
  if (profile?.role !== role) {
    return <Navigate to={`/${profile?.role || ''}`} replace />
  }
  return children
}
