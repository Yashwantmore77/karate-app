import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import AdminTournamentList from '../pages/admin/AdminTournamentList'
import AdminCategoryDetail from '../pages/admin/AdminCategoryDetail'
import TournamentManager from '../pages/tms/TournamentManager'
import CertificatesPrint from '../pages/tms/CertificatesPrint'
import RefereeMatchControl from '../pages/referee/RefereeMatchControl'
import Analytics from '../pages/Analytics'

const BASE = '/tournament_owner'

/**
 * A tournament owner's app: the same tournament screens an administrator
 * works, over the tournaments the owner was given and no others.
 *
 * What is missing here is the point of the role. There are no accounts, no
 * sign-in log, no organisations, rulesets or backups, and no way to create a
 * tournament: those belong to the installation, not to one event. The server
 * refuses them too, so this is the menu agreeing with the API rather than the
 * only thing standing in the way.
 */
export default function OwnerRouter({ uid, profile }) {
  return (
    <Routes>
      <Route path="/" element={<AdminTournamentList uid={uid} profile={profile} basePath={BASE} />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/tournament/:tournamentId" element={<ToManage />} />
      <Route path="/tournament/:tournamentId/manage" element={<TournamentManager uid={uid} profile={profile} basePath={BASE} />} />
      <Route path="/tournament/:tournamentId/category/:categoryId" element={<AdminCategoryDetail uid={uid} basePath={BASE} />} />
      <Route path="/tournament/:tournamentId/certificates/print" element={<CertificatesPrint />} />
      <Route path="/match/:matchId" element={<RefereeMatchControl uid={uid} profile={profile} />} />
      <Route path="*" element={<Navigate to={BASE} />} />
    </Routes>
  )
}

function ToManage() {
  const { tournamentId } = useParams()
  return <Navigate to={`${BASE}/tournament/${tournamentId}/manage`} replace />
}
