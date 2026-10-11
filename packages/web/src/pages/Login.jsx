import { useState, useEffect } from 'react'
import { Navigate, Link as RouterLink } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import {
  Box, Typography, Button, TextField, CircularProgress, Stack, useMediaQuery, Link
} from '@mui/material'
import { useSession } from '../state/SessionContext'
import { testCredentials } from '../data/session'
import { currentCoords } from '../data/geolocation'
import AppStage from '../components/AppStage'
import { AO, AKA, CYAN } from '../theme/tokens'

const validationSchema = Yup.object({
  email: Yup.string().email('Invalid email').required('Email required'),
  password: Yup.string().required('Password required'),
})

const fieldSx = {
  mb: 1,
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' },
  '& .MuiInputLabel-root.Mui-focused': { color: CYAN },
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(4px)',
    transition: 'box-shadow .25s ease, background-color .25s ease',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.16)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.32)' },
    '&.Mui-focused': { backgroundColor: 'rgba(255,255,255,0.07)', boxShadow: `0 0 0 3px ${CYAN}22` },
    '&.Mui-focused fieldset': { borderColor: CYAN },
    // Chrome paints autofilled inputs opaque white, which would break the panel.
    '& input:-webkit-autofill': {
      WebkitTextFillColor: '#fff',
      WebkitBoxShadow: '0 0 0 100px rgba(20,24,40,0.9) inset',
      caretColor: '#fff',
    },
  },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.45)', minHeight: 20 },
  '& .MuiFormHelperText-root.Mui-error': { color: '#FF9192' },
}

// A failed sign-in is not always a wrong password. Saying it was, when the API
// is unreachable or the rate limiter has stepped in, sends people retyping a
// password that was right all along.
const signInFailure = (err) => {
  if (err?.status === 401) return 'Wrong email or password'
  if (err?.status === 429) return 'Too many attempts. Wait a few minutes, then try again.'
  return 'Could not reach the sign-in service. Check the connection and try again.'
}

export default function Login() {
  const { user, profile, login } = useSession()
  const [busy, setBusy] = useState(false)
  // Shown only when the server asks for it (an admin with two-factor on).
  const [needCode, setNeedCode] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  // The administrator credentials, when the server is set up to show them
  // (SHOW_TEST_CREDENTIALS). Null everywhere else, and the panel stays away.
  const [demo, setDemo] = useState(null)
  const stillness = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    let live = true
    testCredentials().then((found) => { if (live) setDemo(found) })
    return () => { live = false }
  }, [])

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      setBusy(true)
      try {
        // Asked for before the credentials go anywhere, because it has to travel
        // with them. Resolves to null whenever the browser will not say — denied,
        // unsupported, or too slow — and the sign-in proceeds regardless.
        const coords = await currentCoords()
        await login(values.email.trim(), values.password, coords, needCode ? code.trim() : null)
      } catch (err) {
        if (err?.code === 'two_factor_required') {
          setNeedCode(true)
          setCodeError('')
        } else if (err?.code === 'invalid_two_factor') {
          setCodeError('That code did not match. Use the current code from your authenticator app.')
        } else {
          formik.setFieldError('password', signInFailure(err))
        }
        setBusy(false)
      }
    },
  })

  const fillDemo = () => {
    formik.setValues({ email: demo.email, password: demo.password })
    formik.setErrors({})
  }

  if (user && profile) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  return (
    <AppStage fill>
      <Box sx={{
        position: 'relative',
        borderRadius: 4,
        p: { xs: 3, sm: 4 },
        color: '#fff',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
      }}>
        <Stack direction="row" spacing={2} sx={{ mb: 3, alignItems: 'center' }}>
          <Box sx={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
            <Box
              component="svg"
              viewBox="0 0 52 52"
              aria-hidden
              sx={{ position: 'absolute', inset: 0, animation: stillness ? 'none' : 'spin 14s linear infinite' }}
            >
              <circle cx="26" cy="26" r="24" fill="none" stroke={CYAN} strokeOpacity="0.5"
                strokeWidth="1.5" strokeDasharray="6 10" strokeLinecap="round" />
            </Box>
            <Box component="svg" viewBox="0 0 52 52" aria-hidden sx={{ position: 'absolute', inset: 0 }}>
              <path d="M26 10 A16 16 0 0 1 26 42 Z" fill={AKA} />
              <path d="M26 10 A16 16 0 0 0 26 42 Z" fill={AO} />
            </Box>
          </Box>
          <Box>
            <Typography sx={{
              fontSize: 30, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.5px',
              background: `linear-gradient(90deg, #fff, ${CYAN})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Kumite
            </Typography>
            <Typography sx={{
              fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)', fontWeight: 600,
            }}>
              WKF scoring system
            </Typography>
          </Box>
        </Stack>

        <Box component="form" onSubmit={formik.handleSubmit} noValidate>
          <TextField
            fullWidth
            label="Email"
            name="email"
            type="email"
            value={formik.values.email}
            onChange={formik.handleChange}
            onKeyDown={(e) => e.key === 'Enter' && formik.handleSubmit()}
            error={!!(formik.errors.email && formik.touched.email)}
            helperText={formik.errors.email && formik.touched.email ? formik.errors.email : ' '}
            autoComplete="email"
            sx={fieldSx}
          />

          <TextField
            fullWidth
            label="Password"
            name="password"
            type="password"
            value={formik.values.password}
            onChange={formik.handleChange}
            onKeyDown={(e) => e.key === 'Enter' && formik.handleSubmit()}
            error={!!formik.errors.password}
            helperText={formik.errors.password ? formik.errors.password : ' '}
            autoComplete="current-password"
            sx={fieldSx}
          />

          {needCode && (
            <TextField
              fullWidth
              autoFocus
              label="6-digit code from your authenticator app"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && formik.handleSubmit()}
              error={!!codeError}
              helperText={codeError || ' '}
              autoComplete="one-time-code"
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              sx={fieldSx}
            />
          )}

          <Button
            fullWidth
            size="large"
            type="submit"
            disabled={busy}
            sx={{
              mt: 1.5,
              py: 1.4,
              fontWeight: 700,
              letterSpacing: '0.5px',
              color: '#fff',
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.18)',
              backgroundImage: `linear-gradient(90deg, ${AO}, #6C3BD6, ${AKA}, ${AO})`,
              backgroundSize: '200% 100%',
              animation: stillness ? 'none' : 'sweep 6s linear infinite',
              transition: 'box-shadow .25s ease, transform .15s ease',
              '&:hover': { boxShadow: `0 0 28px ${CYAN}55`, transform: stillness ? 'none' : 'translateY(-1px)' },
              '&.Mui-disabled': { color: 'rgba(255,255,255,0.7)', opacity: 0.7 },
            }}
          >
            {busy ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Sign in'}
          </Button>
          <Box sx={{ mt: 1.5, textAlign: 'center' }}>
            <Link component={RouterLink} to="/forgot-password" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Forgot password?</Link>
          </Box>
        </Box>

        {demo && (
          <Box sx={{
            mt: 2.5, p: 2, borderRadius: 2,
            border: '1px dashed rgba(255,255,255,0.22)',
            backgroundColor: 'rgba(255,255,255,0.03)',
          }}>
            <Typography sx={{
              fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)', fontWeight: 700, mb: 1,
            }}>
              Administrator, for testing
            </Typography>
            <Stack spacing={0.5} sx={{ mb: 1.5 }}>
              {[['Email', demo.email], ['Password', demo.password]].map(([label, value]) => (
                <Stack key={label} direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                  <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', minWidth: 68 }}>{label}</Typography>
                  <Typography sx={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13, color: '#fff', wordBreak: 'break-all', userSelect: 'all',
                  }}>
                    {value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Button
              fullWidth
              size="small"
              onClick={fillDemo}
              sx={{
                color: CYAN, fontWeight: 700, fontSize: 12, borderRadius: 1.5,
                border: `1px solid ${CYAN}55`,
                '&:hover': { backgroundColor: `${CYAN}14`, borderColor: CYAN },
              }}
            >
              Fill these in
            </Button>
          </Box>
        )}

        {/* The browser's permission prompt is the only warning someone would
            otherwise get, and it arrives without saying who is asking or why. */}
        <Typography sx={{
          mt: 1, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5,
        }}>
          Sign-ins are recorded with the time, device and location for the event log.
        </Typography>
      </Box>
    </AppStage>
  )
}
