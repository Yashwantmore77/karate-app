import { Routes, Route, Navigate } from 'react-router-dom'
import JudgeMatchList from '../pages/judge/JudgeMatchList'
import JudgeMatchView from '../pages/judge/JudgeMatchView'
import JudgeKata from '../pages/judge/JudgeKata'

export default function JudgeRouter({ uid, profile }) {
  return (
    <Routes>
      <Route path="/" element={<JudgeMatchList uid={uid} profile={profile} />} />
      <Route path="/match/:matchId" element={<JudgeMatchView profile={profile} />} />
      <Route path="/kata" element={<JudgeKata profile={profile} uid={uid} />} />
      <Route path="/kata/:tournamentId" element={<JudgeKata profile={profile} uid={uid} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
