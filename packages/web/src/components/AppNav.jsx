import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Box, Button, IconButton, Drawer, List, ListItemButton,
  ListItemText, Typography, Divider, Chip, Tooltip,
} from '@mui/material'
import { Menu as MenuIcon, Logout } from '@mui/icons-material'
import { signOut, auth } from '../firebase'
import { CYAN, TEXT } from '../theme/tokens'
import { useConnection } from '../state/ConnectionContext'

const CONNECTION = {
  online: { label: '● Live', color: 'success' },
  connecting: { label: '○ Connecting…', color: 'warning' },
  reconnecting: { label: '○ Reconnecting…', color: 'warning' },
  offline: { label: '✕ Offline', color: 'error' },
}

// What each role can reach. The scoreboard is on every list because it is the
// one screen anyone might want to throw onto a second display mid-session.
const MENUS = {
  admin: [
    { label: 'Tournaments', to: '/admin' },
    { label: 'Accounts', to: '/admin/accounts' },
    { label: 'Sign-ins', to: '/admin/sign-ins' },
    { label: 'Scoreboard', to: '/display' },
    { label: 'Public site', to: '/tournaments' },
  ],
  registration_officer: [
    { label: 'Registrations', to: '/registration_officer' },
    { label: 'Public site', to: '/tournaments' },
  ],
  weighin_officer: [
    { label: 'Weigh-in', to: '/weighin_officer' },
    { label: 'Public site', to: '/tournaments' },
  ],
  referee: [
    { label: 'Categories', to: '/referee' },
    { label: 'Scoreboard', to: '/display' },
  ],
  judge: [
    { label: 'Matches', to: '/judge' },
    { label: 'Scoreboard', to: '/display' },
  ],
}

const covers = (to, pathname) => pathname === to || pathname.startsWith(`${to}/`)

/**
 * Which item the current URL belongs to.
 *
 * The most specific match wins, so /admin/accounts lights up Accounts without
 * also lighting up Tournaments — every admin path starts with /admin, and a
 * plain prefix test would highlight two items at once.
 */
export const activeItem = (items, pathname) => {
  const hits = items.filter((item) => covers(item.to, pathname))
  if (hits.length === 0) return null
  return hits.reduce((best, item) => (item.to.length > best.to.length ? item : best))
}

/**
 * The header that stays put once someone is signed in.
 *
 * Renders nothing on the sign-in page, on the public scoreboard (a hall screen
 * is not being navigated by anyone), and for a session with no role yet — there
 * is nothing to offer any of them.
 */
export default function AppNav({ user, profile }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { status } = useConnection()
  const connection = CONNECTION[status]

  const items = MENUS[profile?.role === 'super_admin' ? 'admin' : profile?.role] || []
  const onPublicScreen = location.pathname === '/display' || location.pathname === '/login'
  if (!user || !profile || onPublicScreen || items.length === 0) return null

  const active = activeItem(items, location.pathname)

  const go = (to) => {
    setDrawerOpen(false)
    navigate(to)
  }

  const activeSx = {
    color: CYAN,
    backgroundColor: `${CYAN}14`,
    // A colour alone is easy to miss on a dark bar at a glance across a hall.
    borderBottom: `2px solid ${CYAN}`,
    borderRadius: '8px 8px 0 0',
  }

  return (
    <>
      <AppBar position="sticky" className="no-print" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <Box
            component="img"
            src="/icon-192.png"
            alt="Kumite scoring"
            sx={{ width: 34, height: 34, borderRadius: '8px', mr: 1, flexShrink: 0 }}
          />
          <Typography
            variant="h6"
            sx={{ mr: 2, display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}
          >
            Kumite
          </Typography>

          {/* Full menu on a laptop at the scorer's table; a drawer on a phone. */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexGrow: 1 }}>
            {items.map((item) => {
              const isActive = active?.to === item.to
              return (
                <Button
                  key={item.to}
                  onClick={() => go(item.to)}
                  aria-current={isActive ? 'page' : undefined}
                  sx={{
                    color: TEXT.secondary,
                    px: 2,
                    ...(isActive ? activeSx : {}),
                  }}
                >
                  {item.label}
                </Button>
              )
            })}
          </Box>

          <Box sx={{ flexGrow: { xs: 1, md: 0 } }} />

          {/* Only with a server: offline mode has no connection to lose. */}
          {connection && (
            <Tooltip title={status === 'online' ? 'Connected to the tournament server' : 'Changes will not reach other devices until the connection is back'}>
              <Chip label={connection.label} size="small" color={connection.color} variant="outlined" sx={{ mr: 1 }} />
            </Tooltip>
          )}

          <Chip
            label={profile.role}
            size="small"
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 1, textTransform: 'capitalize' }}
          />

          <Tooltip title="Sign out">
            <IconButton
              color="inherit"
              aria-label="Sign out"
              onClick={() => signOut(auth)}
            >
              <Logout />
            </IconButton>
          </Tooltip>

          <IconButton
            color="inherit"
            aria-label="Open menu"
            edge="end"
            onClick={() => setDrawerOpen(true)}
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 240, pt: 1 }} role="presentation">
          <Typography variant="overline" sx={{ px: 2, color: TEXT.secondary }}>
            {profile.role}
          </Typography>
          <Divider sx={{ mt: 1 }} />
          <List>
            {items.map((item) => {
              const isActive = active?.to === item.to
              return (
                <ListItemButton
                  key={item.to}
                  selected={isActive}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => go(item.to)}
                >
                  <ListItemText primary={item.label} />
                </ListItemButton>
              )
            })}
          </List>
        </Box>
      </Drawer>
    </>
  )
}
