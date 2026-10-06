import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress } from '@mui/material'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import { SessionProvider, useSession } from './state/SessionContext'
import Login from './pages/Login'
import NoRoleAssigned from './pages/NoRoleAssigned'
import JudgeRouter from './routes/JudgeRouter'
import RefereeRouter from './routes/RefereeRouter'
import AdminRouter from './routes/AdminRouter'
import StaffRouter from './routes/StaffRouter'
import PublicTournament from './pages/public/PublicTournament'
import PublicTournamentList from './pages/public/PublicTournamentList'
import RegisterPortal from './pages/public/RegisterPortal'
import PasswordReset from './pages/account/PasswordReset'
import MyAccount from './pages/account/MyAccount'
import DisplayScoreboard from './pages/DisplayScoreboard'
import LiveBoard from './pages/public/LiveBoard'
import RequireAuth from './routes/RequireAuth'
import RequireRole from './routes/RequireRole'
import { ConnectionProvider } from './state/ConnectionContext'
import AppStage from './components/AppStage'
import AppNav from './components/AppNav'
import { AO_LIGHT, AKA_LIGHT, CYAN, INK, GLASS, TEXT } from './theme/tokens'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: CYAN, contrastText: '#08131A' },
    secondary: { main: AO_LIGHT, contrastText: '#fff' },
    error: { main: AKA_LIGHT, light: AKA_LIGHT, dark: '#3D0000', contrastText: '#2A0000' },
    info: { main: AO_LIGHT, light: AO_LIGHT, dark: '#0A1B6B', contrastText: '#fff' },
    success: { main: '#7BE8A3', contrastText: '#04210F' },
    warning: { main: '#FFC46B', contrastText: '#2A1A00' },
    // Transparent so the stage shows through pages that fill themselves with
    // background.default; the body and the stage supply the actual ink.
    background: { default: 'transparent', paper: 'rgba(255,255,255,0.045)' },
    text: { primary: TEXT.primary, secondary: TEXT.secondary },
    divider: 'rgba(255,255,255,0.12)',
  },
  typography: {
    fontFamily: '"Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", sans-serif',
    h1: { fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' },
    h2: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' },
    h3: { fontSize: '18px', fontWeight: 600 },
    h4: { fontSize: '16px', fontWeight: 600 },
    body1: { fontSize: '14px', lineHeight: 1.6 },
    body2: { fontSize: '13px', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.25px' },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: INK } },
    },
    // Glass everywhere, so pages inherit the look without being rewritten.
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(8,11,22,0.72)',
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: GLASS.background,
          backdropFilter: GLASS.backdropFilter,
          border: GLASS.border,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: GLASS.background,
          transition: 'border-color .2s ease, box-shadow .2s ease, transform .2s ease',
          '&:hover': {
            borderColor: 'rgba(255,255,255,0.22)',
            boxShadow: `0 18px 50px rgba(0,0,0,0.5), 0 0 24px ${CYAN}14`,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, transition: 'box-shadow .2s ease, transform .15s ease' },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: `0 0 24px ${CYAN}44`, transform: 'translateY(-1px)' },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.22)',
          '&:hover': { borderColor: CYAN, backgroundColor: `${CYAN}12` },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: `${CYAN}14` } },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255,255,255,0.04)',
            transition: 'box-shadow .25s ease, background-color .25s ease',
            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.32)' },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${CYAN}22` },
          },
          '& input:-webkit-autofill': {
            WebkitTextFillColor: '#fff',
            WebkitBoxShadow: '0 0 0 100px rgba(20,24,40,0.95) inset',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
        // Scoped to default chips: colouring every filled chip grey would
        // flatten the status chips that carry meaning.
        filled: {
          '&.MuiChip-colorDefault': { backgroundColor: 'rgba(255,255,255,0.10)' },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color .15s ease',
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: 'rgba(255,255,255,0.10)' },
        head: { color: TEXT.secondary, fontWeight: 700, letterSpacing: '0.4px' },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
  },
})

export default function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  )
}

// Split out so it can sit inside SessionProvider and call useSession(): the
// provider itself picks the API or the local mock, and everything below this
// line is identical either way.
function AppShell() {
  const { user, profile, loading } = useSession()
  const isPortal = new URLSearchParams(location.search).has('portal')

  if (isPortal) return <ConnectionProvider><DisplayScoreboard /></ConnectionProvider>

  // A super admin works the admin screens; the permission table still tells
  // them apart where it matters (section 3.1).
  const routeProfile = profile?.role === 'super_admin' ? { ...profile, role: 'admin' } : profile
  const homePath = !user ? '/login' : !profile ? '/no-role' : `/${routeProfile.role}`

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ConnectionProvider>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <CircularProgress />
        </Box>
      ) : (
        <BrowserRouter>
          <AppStage>
          {/* One header for the whole signed-in app, so the menu survives
              navigation instead of each page drawing its own. */}
          <AppNav user={user} profile={profile} />
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Public: a hall screen, no sign-in */}
            <Route path="/display" element={<DisplayScoreboard />} />
            {/* PRD point 22: the hall board — every mat, what is next, brackets. */}
            <Route path="/live" element={<LiveBoard />} />

            {/* Public website and the coach registration link (PRD 14, 39, 54) */}
            <Route path="/tournaments" element={<PublicTournamentList />} />
            <Route path="/tournament/:slug" element={<PublicTournament />} />
            <Route path="/register/:token" element={<RegisterPortal />} />
            <Route path="/forgot-password" element={<PasswordReset />} />
            <Route path="/reset-password" element={<PasswordReset />} />
            <Route path="/account" element={<RequireAuth user={user}><MyAccount /></RequireAuth>} />

            <Route
              path="/no-role"
              element={
                <RequireAuth user={user}>
                  {profile ? <Navigate to={`/${routeProfile.role}`} replace /> : <NoRoleAssigned uid={user?.uid} />}
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
                    <RequireRole role="admin" profile={routeProfile}><AdminRouter uid={user.uid} profile={profile} /></RequireRole>
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
                    <RequireRole role={['referee', 'admin']} profile={profile}><RefereeRouter uid={user.uid} profile={profile} /></RequireRole>
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

            <Route
              path="/registration_officer/*"
              element={
                <RequireAuth user={user}>
                  {!profile ? (
                    <Navigate to="/no-role" replace />
                  ) : (
                    <RequireRole role="registration_officer" profile={profile}><StaffRouter uid={user.uid} profile={profile} /></RequireRole>
                  )}
                </RequireAuth>
              }
            />
            <Route
              path="/announcer/*"
              element={
                <RequireAuth user={user}>
                  {!profile ? (
                    <Navigate to="/no-role" replace />
                  ) : (
                    <RequireRole role="announcer" profile={profile}><StaffRouter uid={user.uid} profile={profile} /></RequireRole>
                  )}
                </RequireAuth>
              }
            />
            <Route
              path="/viewer/*"
              element={
                <RequireAuth user={user}>
                  {!profile ? (
                    <Navigate to="/no-role" replace />
                  ) : (
                    <RequireRole role="viewer" profile={profile}><StaffRouter uid={user.uid} profile={profile} /></RequireRole>
                  )}
                </RequireAuth>
              }
            />
            <Route
              path="/weighin_officer/*"
              element={
                <RequireAuth user={user}>
                  {!profile ? (
                    <Navigate to="/no-role" replace />
                  ) : (
                    <RequireRole role="weighin_officer" profile={profile}><StaffRouter uid={user.uid} profile={profile} /></RequireRole>
                  )}
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to={homePath} replace />} />
          </Routes>
          </AppStage>
        </BrowserRouter>
      )}
      </ConnectionProvider>
      <SpeedInsights />
      <Analytics />
    </ThemeProvider>
  )
}
