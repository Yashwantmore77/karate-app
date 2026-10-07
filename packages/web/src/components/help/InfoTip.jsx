import { useState } from 'react'
import { Tooltip, IconButton, ClickAwayListener, Box, Typography } from '@mui/material'
import { InfoOutlined } from '@mui/icons-material'
import { HELP } from '../../help/guide'
import { CYAN } from '../../theme/tokens'

/** The text inside an ⓘ tooltip: title, what it does, tips, before / next. */
export function HelpContent({ title, text, tips, before, next }) {
  return (
    <Box sx={{ py: 0.5 }}>
      {title && <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 0.5 }}>{title}</Typography>}
      {text && <Typography sx={{ fontSize: '0.85rem', lineHeight: 1.45 }}>{text}</Typography>}
      {tips?.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25 }}>
          {tips.map((tip) => <Typography component="li" key={tip} sx={{ fontSize: '0.82rem', lineHeight: 1.4 }}>{tip}</Typography>)}
        </Box>
      )}
      {(before || next) && (
        <Box sx={{ mt: 1, pt: 0.75, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          {before && <Typography sx={{ fontSize: '0.82rem' }}><b>⟵ Before:</b> {before}</Typography>}
          {next && <Typography sx={{ fontSize: '0.82rem' }}><b>Next ⟶</b> {next}</Typography>}
        </Box>
      )}
    </Box>
  )
}

/**
 * The ⓘ icon. Hover (or keyboard focus) on a computer, tap on a phone or
 * tablet; tap again or anywhere else to close.
 *
 *   <InfoTip id="draw.categorise" />            – text from help/guide.js
 *   <InfoTip title="…" text="…" next="…" />     – text given here
 */
export default function InfoTip({ id, title, text, tips, before, next, placement = 'bottom-start', size = 18, sx }) {
  const [open, setOpen] = useState(false)
  const help = { ...(id ? HELP[id] : null), ...(title && { title }), ...(text && { text }), ...(tips && { tips }), ...(before && { before }), ...(next && { next }) }
  if (!help.text && !help.title) return null
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'middle' }}>
        <Tooltip
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          disableTouchListener
          arrow
          placement={placement}
          title={<HelpContent {...help} />}
          slotProps={{ tooltip: { sx: { maxWidth: 360, p: 1.5, bgcolor: '#1b2530', border: '1px solid rgba(147,255,255,0.35)', boxShadow: 6 } }, arrow: { sx: { color: '#1b2530' } } }}
        >
          <IconButton
            size="small"
            aria-label={`What is this: ${help.title || 'help'}`}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o) }}
            sx={{ p: 0.25, ml: 0.5, color: CYAN, opacity: 0.8, '&:hover': { opacity: 1 }, ...sx }}
          >
            <InfoOutlined sx={{ fontSize: size }} />
          </IconButton>
        </Tooltip>
      </Box>
    </ClickAwayListener>
  )
}

/** A heading with its ⓘ icon: <HelpTitle id="setup.rules" variant="h3">Competition rules</HelpTitle> */
export function HelpTitle({ id, children, sx, ...props }) {
  return (
    <Typography {...props} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', ...sx }}>
      {children}
      <InfoTip id={id} />
    </Typography>
  )
}
