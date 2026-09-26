// The single clock formatter. Two devices that agree on the milliseconds still
// disagree on screen if one floors and another ceils, so nothing else rounds.

export const formatClock = (ms) => {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export const parseDuration = (minutes, seconds) =>
  (Math.max(0, minutes) * 60 + Math.max(0, Math.min(59, seconds))) * 1000

export const toMinutesSeconds = (ms) => {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  return { minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60 }
}
