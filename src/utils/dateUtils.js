// Shared date helpers for tournament expiry checks and DatePicker <-> storage conversion

export const isExpired = (dateStr) => {
  if (!dateStr) return false
  const targetDate = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return targetDate < today
}

// Accepts a dayjs object (from MUI DatePicker) or a native Date, returns 'YYYY-MM-DD'
export const formatDate = (date) => {
  if (!date) return null
  if (typeof date.format === 'function') return date.format('YYYY-MM-DD')
  return new Date(date).toISOString().split('T')[0]
}
