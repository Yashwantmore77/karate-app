import { useCallback, useState } from 'react'
import { Snackbar, Alert } from '@mui/material'
import { describeError } from '../../data/tms'

/**
 * Runs an action with a busy flag and a readable outcome (section 59: clear
 * error messages, loading states). `feedback` is the snackbar to render.
 */
export default function useAction() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const run = useCallback(async (fn, success = null) => {
    setBusy(true)
    try {
      const out = await fn()
      if (success) setMessage({ severity: 'success', text: typeof success === 'function' ? success(out) : success })
      return out
    } catch (err) {
      setMessage({ severity: 'error', text: describeError(err) })
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])

  const feedback = (
    <Snackbar open={!!message} autoHideDuration={message?.severity === 'error' ? 8000 : 3500}
      onClose={() => setMessage(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      {message ? <Alert severity={message.severity} onClose={() => setMessage(null)} variant="filled">{message.text}</Alert> : <span />}
    </Snackbar>
  )

  return { run, busy, feedback, notify: setMessage }
}
