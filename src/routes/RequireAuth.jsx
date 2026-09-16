import { Navigate } from 'react-router-dom'

// Guards protected routes: no signed-in user means an immediate redirect to /login.
export default function RequireAuth({ user, children }) {
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}
