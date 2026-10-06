import { Navigate } from 'react-router-dom'

/**
 * Renders children only for the roles named, and otherwise sends the user to
 * the section that belongs to their own role.
 *
 * `role` may be one role or several. An administrator is let into the
 * referee section by naming both there: the API already lets an admin do
 * everything a referee can, and a UI that refused them left match deletion,
 * which only an admin may do, on a screen no admin could open.
 */
export default function RequireRole({ role, profile, children }) {
  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.includes(profile?.role)) {
    return <Navigate to={`/${profile?.role || ''}`} replace />
  }
  return children
}
