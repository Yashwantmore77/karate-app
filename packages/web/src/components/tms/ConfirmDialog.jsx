import { useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField } from '@mui/material'

/**
 * Section 60: confirm before anything destructive or hard to undo. With
 * `requireReason`, the action cannot go ahead until a reason is typed — the
 * reason that ends up in the audit log.
 */
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', danger = false, requireReason = false,
  reasonLabel = 'Reason', onConfirm, onClose,
}) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  const blocked = requireReason && !reason.trim()
  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {message && <DialogContentText sx={{ mb: requireReason ? 2 : 0 }}>{message}</DialogContentText>}
        {requireReason && (
          <TextField autoFocus fullWidth multiline minRows={2} label={reasonLabel} value={reason}
            onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} disabled={blocked}
          data-tip={`Goes ahead with what this box describes${requireReason ? '; your reason is kept in the audit log' : ''}. Cancel closes it without changing anything.`}
          data-tip-needs={requireReason ? `Type the ${reasonLabel.toLowerCase()} first.` : undefined}
          onClick={() => onConfirm(reason.trim() || null)}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
