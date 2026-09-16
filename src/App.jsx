import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress } from '@mui/material'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { auth, db, onAuthStateChanged, doc, getDoc } from './firebase'
import Login from './pages/Login'
import NoRoleAssigned from './pages/NoRoleAssigned'
import JudgeRouter from './routes/JudgeRouter'
import RefereeRouter from './routes/RefereeRouter'
import AdminRouter from './routes/AdminRouter'
import Portal from './pages/Portal'
import RequireAuth from './routes/RequireAuth'
import RequireRole from './routes/RequireRole'
import { initializeMockData } from './utils/mockData'

// Initialize mock data on app start
initializeMockData()

const theme = createTheme({
  palette: {
    primary: {
      main: '#5B7FA6',
      light: '#8FA3BB',
      dark: '#3D5266',
      contrastText: '#fff',
    },
    secondary: {
      main: '#6B7280',
      light: '#9CA3AF',
      dark: '#374151',
      contrastText: '#fff',
    },
    success: { main: '#4B7F5F', contrastText: '#fff' },
    warning: { main: '#8B7355', contrastText: '#fff' },
    error: { main: '#9B4A54', contrastText: '#fff' },
    info: { main: '#5B8FA3', contrastText: '#fff' },
    background: {
      default: '#FAFBFC',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2D3748',
      secondary: '#718096',
    },
    divider: '#E2E8F0',
  },
  typography: {
    fontFamily: '"Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", sans-serif',
    h1: { fontSize: '28px', fontWeight: 600, letterSpacing: '-0.5px' },
    h2: { fontSize: '22px', fontWeight: 600, letterSpacing: '-0.3px' },
    h3: { fontSize: '18px', fontWeight: 600 },
    h4: { fontSize: '16px', fontWeight: 600 },
    body1: { fontSize: '14px', lineHeight: 1.6 },
    body2: { fontSize: '13px', lineHeight: 1.6, color: '#718096' },
    button: { textTransform: 'none', fontWeight: 500, letterSpacing: '0.25px' },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#FAFBFC',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(135deg, #5B7FA6 0%, #6B7280 100%)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          letterSpacing: '0.25px',
          borderRadius: 8,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(91, 127, 166, 0.15)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
          border: '1px solid #E2E8F0',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
          border: '1px solid #E2E8F0',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: '#FFFFFF',
            transition: 'all 0.2s ease',
            '&:hover fieldset': {
              borderColor: '#CBD5E0',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
        filled: {
          backgroundColor: '#EDF2F7',
          color: '#2D3748',
          '&:hover': {
            backgroundColor: '#E2E8F0',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: 'none',
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          '& thead': {
            backgroundColor: '#F7FAFC',
          },
          '& tbody tr:hover': {
            backgroundColor: '#F9FAFB',
          },
        },
      },
    },
  },
})

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const isPortal = new URLSearchParams(location.search).has('portal')

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const snap = await getDoc(doc(db, 'roles', u.uid))
        setProfile(snap.exists() ? snap.data() : null)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  if (isPortal) return <Portal />

  const homePath = !user ? '/login' : !profile ? '/no-role' : `/${profile.role}`

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress />
        </Box>
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login user={user} profile={profile} />} />

            <Route
              path="/no-role"
              element={
                <RequireAuth user={user}>
                  {profile ? <Navigate to={`/${profile.role}`} replace /> : <NoRoleAssigned uid={user?.uid} />}
                </RequireAuth>
              }
            />

            <Route
              path="/admin/*"
              element={
                <RequireAuth user={user}>
                  {!profile ? (
                    <Navigate to="/no-role" replace />
                  ) : (
                    <RequireRole role="admin" profile={profile}><AdminRouter uid={user.uid} /></RequireRole>
                  )}
                </RequireAuth>
              }
            />
            <Route
              path="/referee/*"
              element={
                <RequireAuth user={user}>
                  {!profile ? (
                    <Navigate to="/no-role" replace />
                  ) : (
                    <RequireRole role="referee" profile={profile}><RefereeRouter uid={user.uid} profile={profile} /></RequireRole>
                  )}
                </RequireAuth>
              }
            />
            <Route
              path="/judge/*"
              element={
                <RequireAuth user={user}>
                  {!profile ? (
                    <Navigate to="/no-role" replace />
                  ) : (
                    <RequireRole role="judge" profile={profile}><JudgeRouter uid={user.uid} profile={profile} /></RequireRole>
                  )}
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to={homePath} replace />} />
          </Routes>
        </BrowserRouter>
      )}
      <SpeedInsights />
    </ThemeProvider>
  )
}
