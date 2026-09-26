import { Routes, Route, Navigate } from 'react-router-dom'
import AdminTournamentList from '../pages/admin/AdminTournamentList'
import AdminTournamentDetail from '../pages/admin/AdminTournamentDetail'
import AdminCategoryDetail from '../pages/admin/AdminCategoryDetail'

export default function AdminRouter({ uid }) {
  return (
    <Routes>
      <Route path="/" element={<AdminTournamentList uid={uid} />} />
      <Route path="/tournament/:tournamentId" element={<AdminTournamentDetail uid={uid} />} />
      <Route path="/tournament/:tournamentId/category/:categoryId" element={<AdminCategoryDetail uid={uid} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
