import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, Typography, Button, TextField, Alert, CircularProgress, Chip, Stack, Card, FormHelperText } from '@mui/material'
import { signInWithEmailAndPassword, auth } from '../firebase'

const testUsers = [
  { label: 'Admin', email: 'admin@kata.local', pass: 'test123' },
  { label: 'Referee', email: 'referee@kata.local', pass: 'test123' },
  { label: 'Judge 1', email: 'judge1@kata.local', pass: 'test123' },
  { label: 'Judge 2', email: 'judge2@kata.local', pass: 'test123' },
  { label: 'Judge 3', email: 'judge3@kata.local', pass: 'test123' },
  { label: 'Judge 4', email: 'judge4@kata.local', pass: 'test123' },
]

const validationSchema = Yup.object({
  email: Yup.string().email('Invalid email').required('Email required'),
  password: Yup.string().required('Password required'),
})

export default function Login({ user, profile }) {
  const [busy, setBusy] = useState(false)

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      setBusy(true)
      try {
        await signInWithEmailAndPassword(auth, values.email.trim(), values.password)
      } catch {
        formik.setFieldError('password', 'Wrong email or password')
        setBusy(false)
      }
    },
  })

  const selectUser = (testUser) => {
    formik.setValues({ email: testUser.email, password: testUser.pass })
    formik.setErrors({})
  }

  if (user && profile) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  return (
    <Container maxWidth="sm">
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Card sx={{ width: '100%', p: 4 }}>
          <Typography variant="h1" textAlign="center" mb={0.5} sx={{ color: 'primary.main' }}>
            Kata Scoring
          </Typography>
          <Typography variant="body2" textAlign="center" color="text.secondary" mb={3}>
            Tournament scoring system
          </Typography>

          <Stack direction="row" spacing={1} mb={3} flexWrap="wrap" useFlexGap>
            {testUsers.map((testUser) => (
              <Chip
                key={testUser.email}
                label={testUser.label}
                onClick={() => selectUser(testUser)}
                variant={formik.values.email === testUser.email ? 'filled' : 'outlined'}
                color={formik.values.email === testUser.email ? 'primary' : 'default'}
                sx={{ flex: '1 1 auto', minWidth: 70, cursor: 'pointer' }}
              />
            ))}
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
              margin="normal"
              placeholder="Enter email"
              autoComplete="email"
            />

            <TextField
              fullWidth
              label="Password"
              name="password"
              type="password"
              value={formik.values.password}
              onChange={formik.handleChange}
              onKeyDown={(e) => e.key === 'Enter' && formik.handleSubmit()}
              error={!!(formik.errors.password)}
              helperText={formik.errors.password ? formik.errors.password : ' '}
              margin="normal"
              placeholder="Enter password"
              autoComplete="current-password"
            />

            <Button
              fullWidth
              variant="contained"
              size="large"
              type="submit"
              disabled={busy}
              sx={{ mt: 1, mb: 2 }}
            >
              {busy ? <CircularProgress size={24} /> : 'Sign in'}
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" textAlign="center" display="block" sx={{ mt: 2 }}>
            Demo app • Use test credentials above
          </Typography>
        </Card>
      </Box>
    </Container>
  )
}
