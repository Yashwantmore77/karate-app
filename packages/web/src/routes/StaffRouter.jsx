import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import TournamentSelector from '../components/tms/TournamentSelector'
import TournamentManager from '../pages/tms/TournamentManager'
import { ROLE_LABEL } from '@kumite/shared/permissions.js'

/**
 * PRD sections 3.3 and 3.4: registration and weigh-in officers work inside
 * one tournament, and see only the tabs their permissions cover.
 */
export default function StaffRouter({ uid, profile }) {
  const navigate = useNavigate()
  const base = `/${profile.role}`
  return (
    <Routes>
      <Route path="/" element={<TournamentSelector title={`${ROLE_LABEL[profile.role] || 'Staff'}: choose a tournament`} onPick={(t) => navigate(`${base}/tournament/${t.id}`)} />} />
      <Route path="/tournament/:tournamentId" element={<TournamentManager uid={uid} profile={profile} basePath={base} />} />
      <Route path="*" element={<Navigate to={base} />} />
    </Routes>
  )
}
