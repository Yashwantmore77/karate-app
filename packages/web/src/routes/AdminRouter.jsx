import { Routes, Route, Navigate } from 'react-router-dom'
import AdminTournamentList from '../pages/admin/AdminTournamentList'
import AdminTournamentDetail from '../pages/admin/AdminTournamentDetail'
import AdminCategoryDetail from '../pages/admin/AdminCategoryDetail'
import AdminUserList from '../pages/admin/AdminUserList'
import AdminLoginLog from '../pages/admin/AdminLoginLog'
import TournamentManager from '../pages/tms/TournamentManager'
import CertificatesPrint from '../pages/tms/CertificatesPrint'
import RefereeMatchControl from '../pages/referee/RefereeMatchControl'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminOrganizations from '../pages/admin/AdminOrganizations'

export default function AdminRouter({ uid, profile }) {
  return (
    <Routes>
      <Route path="/" element={<AdminTournamentList uid={uid} />} />
      <Route path="/dashboard" element={<AdminDashboard profile={profile} />} />
      {profile?.role === 'super_admin' && <Route path="/organizations" element={<AdminOrganizations />} />}
      <Route path="/accounts" element={<AdminUserList uid={uid} />} />
      <Route path="/sign-ins" element={<AdminLoginLog />} />
      <Route path="/tournament/:tournamentId" element={<AdminTournamentDetail uid={uid} />} />
      <Route path="/tournament/:tournamentId/category/:categoryId" element={<AdminCategoryDetail uid={uid} />} />
      {/* PRD tournament management, on top of the screens above. */}
      <Route path="/tournament/:tournamentId/manage" element={<TournamentManager uid={uid} profile={profile} />} />
      <Route path="/tournament/:tournamentId/certificates/print" element={<CertificatesPrint />} />
      <Route path="/match/:matchId" element={<RefereeMatchControl uid={uid} profile={profile} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
