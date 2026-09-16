import { Routes, Route, Navigate } from 'react-router-dom'
import RefereeCategoryList from '../pages/referee/RefereeCategoryList'
import RefereeMatchList from '../pages/referee/RefereeMatchList'
import RefereeMatchControl from '../pages/referee/RefereeMatchControl'

export default function RefereeRouter({ uid, profile }) {
  return (
    <Routes>
      <Route path="/" element={<RefereeCategoryList uid={uid} />} />
      <Route path="/category/:categoryId" element={<RefereeMatchList uid={uid} />} />
      <Route path="/match/:matchId" element={<RefereeMatchControl uid={uid} profile={profile} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
