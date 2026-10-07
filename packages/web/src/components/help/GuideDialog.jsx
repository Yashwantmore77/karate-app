import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Chip, Stack, IconButton, Alert,
} from '@mui/material'
import { CheckCircle, RadioButtonUnchecked, RemoveCircleOutlineOutlined as RemoveCircleOutline, Close, ArrowForward } from '@mui/icons-material'
import { WORKFLOW, ROLE_GUIDE } from '../../help/guide'

const ROLE_NAME = {
  admin: 'Admin', super_admin: 'Super admin', registration_officer: 'Registration officer', weighin_officer: 'Weigh-in officer',
  referee: 'Referee', judge: 'Judge', announcer: 'Announcer', scoreboard_operator: 'Scoreboard operator', coach: 'Coach', viewer: 'Viewer',
}

const STATE_ICON = {
  done: <CheckCircle color="success" />,
  todo: <RadioButtonUnchecked sx={{ color: 'text.secondary' }} />,
  skip: <RemoveCircleOutline sx={{ color: 'text.disabled' }} />,
}

/**
 * "How to run a tournament": every step from creating the tournament to
 * completing it. Inside a tournament (`steps` given) each step shows whether
 * it is done and has a Go button; elsewhere it is the plain guide.
 */
export default function GuideDialog({ open, onClose, steps = null, next = null, canGo = () => false, onGo, role }) {
  const list = steps || WORKFLOW.map((s) => ({ ...s, state: null }))
  const roleTips = ROLE_GUIDE[role]
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        How to run a tournament — step by step
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {roleTips && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Your job as {ROLE_NAME[role] || role}</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {roleTips.map((tip) => <li key={tip}><Typography variant="body2">{tip}</Typography></li>)}
            </Box>
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Follow the steps from top to bottom. {steps ? 'A green tick means the step is done for this tournament.' : 'Open a tournament and press Manage to see which steps are done.'}
        </Typography>
        <Stack spacing={1}>
          {list.map((step, i) => {
            const isNext = next?.id === step.id
            return (
              <Box
                key={step.id}
                sx={{
                  display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5, borderRadius: 2,
                  border: '1px solid', borderColor: isNext ? 'info.main' : 'divider',
                  bgcolor: isNext ? 'rgba(147,255,255,0.08)' : 'transparent',
                  opacity: step.state === 'skip' ? 0.6 : 1,
                }}
              >
                <Box sx={{ pt: 0.25, display: 'flex' }}>{step.state ? STATE_ICON[step.state] : <Chip size="small" label={i + 1} />}</Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Typography sx={{ fontWeight: 700 }}>{step.state ? `${i + 1}. ` : ''}{step.title}</Typography>
                    {isNext && <Chip size="small" color="info" label="Do this now" />}
                    {step.optional && <Chip size="small" variant="outlined" label="Optional" />}
                    {step.state === 'skip' && <Chip size="small" variant="outlined" label="Not needed for this event" />}
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.25 }}>{step.what}</Typography>
                  <Typography variant="caption" color="text.secondary">Where: {step.where} · Who: {step.who}</Typography>
                </Box>
                {step.tab && canGo(step.tab) && (
                  <Button size="small" variant={isNext ? 'contained' : 'outlined'} endIcon={<ArrowForward />} onClick={() => onGo(step.tab)} sx={{ flexShrink: 0 }}>Go</Button>
                )}
              </Box>
            )
          })}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  )
}
