import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import {
  Box, Typography, Button, TextField, CircularProgress, Stack, useMediaQuery
} from '@mui/material'
import { signInWithEmailAndPassword, signOut, auth } from '../firebase'
import { loginToServer } from '../data/session'

const AO = '#0000C0'
const AKA = '#C00000'
const CYAN = '#93FFFF'
const INK = '#05070F'

const testUsers = [
  { label: 'Admin', email: 'admin@kata.local', pass: 'test123', accent: CYAN },
  { label: 'Referee', email: 'referee@kata.local', pass: 'test123', accent: '#5B7BFF' },
  { label: 'Judge 1', email: 'judge1@kata.local', pass: 'test123', accent: '#FF9192' },
  { label: 'Judge 2', email: 'judge2@kata.local', pass: 'test123', accent: '#FF9192' },
  { label: 'Judge 3', email: 'judge3@kata.local', pass: 'test123', accent: '#FF9192' },
  { label: 'Judge 4', email: 'judge4@kata.local', pass: 'test123', accent: '#FF9192' },
]

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

export default function Login({ user, profile }) {
  const [busy, setBusy] = useState(false)
  const stageRef = useRef(null)
  const stillness = useMediaQuery('(prefers-reduced-motion: reduce)')

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      setBusy(true)
      const email = values.email.trim()
      try {
        await signInWithEmailAndPassword(auth, email, values.password)
      } catch {
        formik.setFieldError('password', 'Wrong email or password')
        setBusy(false)
        return
      }
      try {
        // With no server configured there is nothing to exchange, and the app
        // runs on the local adapter exactly as before.
        await loginToServer(email, values.password)
      } catch {
        // Undo the local sign-in, otherwise the app navigates away and this
        // message is never seen.
        await signOut(auth)
        formik.setFieldError('password', 'The match server rejected these details')
        setBusy(false)
      }
    },
  })

  // Written straight to CSS variables: pointer moves fire far too often to
  // put through React state.
  const trackPointer = (e) => {
    const el = stageRef.current
    if (!el || stillness) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--px', `${((e.clientX - rect.left) / rect.width) * 100}%`)
    el.style.setProperty('--py', `${((e.clientY - rect.top) / rect.height) * 100}%`)
  }

  const selectUser = (testUser) => {
    formik.setValues({ email: testUser.email, password: testUser.pass })
    formik.setErrors({})
  }

  if (user && profile) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  const drift = stillness ? 'none' : 'drift 18s ease-in-out infinite alternate'

  return (
    <Box
      ref={stageRef}
      onPointerMove={trackPointer}
      sx={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        bgcolor: INK,
        display: 'grid',
        placeItems: 'center',
        px: 2,
        '--px': '50%',
        '--py': '40%',
        '@keyframes drift': {
          from: { transform: 'translate3d(0,0,0) scale(1)' },
          to: { transform: 'translate3d(0,-6%,0) scale(1.15)' },
        },
        '@keyframes sweep': {
          from: { backgroundPosition: '0% 50%' },
          to: { backgroundPosition: '200% 50%' },
        },
        '@keyframes spin': {
          to: { transform: 'rotate(360deg)' },
        },
      }}
    >
      {/* The two sides of a mat, bled into the dark. */}
      <Box aria-hidden sx={{
        position: 'absolute', width: '62vmax', height: '62vmax', left: '-18vmax', top: '-14vmax',
        background: `radial-gradient(circle, ${AO}cc 0%, ${AO}00 62%)`,
        filter: 'blur(40px)', animation: drift,
      }} />
      <Box aria-hidden sx={{
        position: 'absolute', width: '58vmax', height: '58vmax', right: '-16vmax', bottom: '-16vmax',
        background: `radial-gradient(circle, ${AKA}cc 0%, ${AKA}00 62%)`,
        filter: 'blur(40px)', animation: drift, animationDelay: '-9s',
      }} />

      <Box aria-hidden sx={{
        position: 'absolute', inset: 0,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse at 50% 40%, #000 20%, transparent 78%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, #000 20%, transparent 78%)',
      }} />

      <Box aria-hidden sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(520px circle at var(--px) var(--py), ${CYAN}1f, transparent 70%)`,
        transition: 'background 120ms linear',
      }} />

      <Box sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        borderRadius: 4,
        p: { xs: 3, sm: 4 },
        color: '#fff',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
      }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
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

        <Typography sx={{
          fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)', fontWeight: 700, mb: 1.5,
        }}>
          Sign in as
        </Typography>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
          gap: 1,
          mb: 3,
        }}>
          {testUsers.map((testUser) => {
            const active = formik.values.email === testUser.email
            return (
              <Box
                key={testUser.email}
                role="button"
                tabIndex={0}
                onClick={() => selectUser(testUser)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectUser(testUser)
                  }
                }}
                sx={{
                  cursor: 'pointer',
                  userSelect: 'none',
                  textAlign: 'center',
                  py: 1.1,
                  borderRadius: 2,
                  fontSize: 13,
                  fontWeight: 600,
                  color: active ? '#fff' : 'rgba(255,255,255,0.68)',
                  border: '1px solid',
                  borderColor: active ? testUser.accent : 'rgba(255,255,255,0.14)',
                  backgroundColor: active ? `${testUser.accent}24` : 'rgba(255,255,255,0.03)',
                  boxShadow: active ? `0 0 18px ${testUser.accent}44` : 'none',
                  transition: 'all .2s ease',
                  '&:hover': {
                    borderColor: testUser.accent,
                    backgroundColor: `${testUser.accent}1c`,
                    transform: stillness ? 'none' : 'translateY(-2px)',
                  },
                  '&:focus-visible': { outline: `2px solid ${CYAN}`, outlineOffset: 2 },
                }}
              >
                {testUser.label}
              </Box>
            )
          })}
        </Box>

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
        </Box>

        <Typography sx={{
          mt: 2.5, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)',
        }}>
          Pick a role above to fill the demo credentials
        </Typography>
      </Box>
    </Box>
  )
}
