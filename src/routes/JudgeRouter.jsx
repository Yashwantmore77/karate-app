import { Routes, Route, Navigate } from 'react-router-dom'
import JudgeMatchList from '../pages/judge/JudgeMatchList'
import JudgeMatchView from '../pages/judge/JudgeMatchView'

export default function JudgeRouter({ uid, profile }) {
  return (
    <Routes>
      <Route path="/" element={<JudgeMatchList uid={uid} profile={profile} />} />
      <Route path="/match/:matchId" element={<JudgeMatchView profile={profile} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
