import { Chip } from '@mui/material'

// Section 59: statuses are readable without colour. Every badge carries its
// word and a shape, so a colour-blind official reads it as well as anyone.
const TONE = {
  success: ['APPROVED', 'PAID', 'PASSED', 'COMPLETED', 'completed', 'PAYMENT_VERIFIED', 'WEIGH_IN_VERIFIED', 'CATEGORY_CONFIRMED', 'DRAW_ASSIGNED', 'LIVE', 'READY', 'gold'],
  warning: ['SUBMITTED', 'PENDING_VERIFICATION', 'PENDING', 'PAYMENT_PENDING', 'WEIGH_IN_PENDING', 'RECHECK_REQUIRED', 'REGISTRATION_OPEN', 'VERIFICATION', 'WEIGH_IN', 'scheduled', 'open', 'silver'],
  error: ['REJECTED', 'FAILED', 'REFUNDED', 'CANCELLED', 'DISQUALIFIED'],
  info: ['DRAFT', 'REGISTRATION_CLOSED', 'DRAW_GENERATED', 'live', 'ARCHIVED', 'bronze'],
}
const SHAPE = { success: '✓', warning: '●', error: '✕', info: '◆', default: '○' }

export const toneOf = (status) => Object.keys(TONE).find((t) => TONE[t].includes(status)) || 'default'

export const humanize = (status) => String(status ?? '—').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

export default function StatusBadge({ status, label, size = 'small' }) {
  const tone = toneOf(status)
  return (
    <Chip
      size={size}
      color={tone === 'default' ? 'default' : tone}
      variant={tone === 'default' ? 'filled' : 'outlined'}
      label={`${SHAPE[tone]} ${label || humanize(status)}`}
      sx={{ fontWeight: 600, maxWidth: '100%' }}
    />
  )
}
