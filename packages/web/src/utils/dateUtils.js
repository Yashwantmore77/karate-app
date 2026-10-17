// Shared date helpers for tournament expiry checks

export const isExpired = (dateStr) => {
  if (!dateStr) return false
  const targetDate = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return targetDate < today
}
