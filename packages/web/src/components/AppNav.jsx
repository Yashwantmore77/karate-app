import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Box, Button, IconButton, Drawer, List, ListItemButton,
  ListItemText, Typography, Divider, Chip, Tooltip,
} from '@mui/material'
import { Menu as MenuIcon, Logout } from '@mui/icons-material'
import { useSession } from '../state/SessionContext'
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
    { label: 'Dashboard', to: '/admin/dashboard' },
    { label: 'Tournaments', to: '/admin' },
    // The referee screens, which an admin may also use: scheduling, panels,
    // the draw, and deleting a bout.
    { label: 'Matches', to: '/referee' },
    { label: 'Accounts', to: '/admin/accounts' },
    { label: 'Sign-ins', to: '/admin/sign-ins' },
    { label: 'System', to: '/admin/system' },
    { label: 'Scoreboard', to: '/display' },
    { label: 'Live board', to: '/live' },
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
    { label: 'Matches', to: '/referee' },
    { label: 'Scoreboard', to: '/display' },
  ],
  judge: [
    { label: 'Matches', to: '/judge' },
    { label: 'Kata scoring', to: '/judge/kata' },
    { label: 'Scoreboard', to: '/display' },
  ],
  announcer: [
    { label: 'Call matches', to: '/announcer' },
    { label: 'Live board', to: '/live' },
    { label: 'Public site', to: '/tournaments' },
  ],
  // PRD v1 §4: runs the hall screens.
  scoreboard_operator: [
    { label: 'Scoreboard control', to: '/scoreboard_operator' },
    { label: 'Scoreboard', to: '/display' },
    { label: 'Live board', to: '/live' },
  ],
  coach: [
    { label: 'My team', to: '/coach' },
    { label: 'Public site', to: '/tournaments' },
  ],
  viewer: [
    { label: 'Tournaments', to: '/viewer' },
    { label: 'Live board', to: '/live' },
    { label: 'Public site', to: '/tournaments' },
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
  const { logout } = useSession()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { status } = useConnection()
  const connection = CONNECTION[status]

  const base = profile?.role === 'super_admin'
    ? [...MENUS.admin.slice(0, 3), { label: 'Organisations', to: '/admin/organizations' }, { label: 'Rulesets', to: '/admin/rulesets' }, ...MENUS.admin.slice(3)]
    : MENUS[profile?.role] || []
  const items = base.length && profile?.role !== 'coach' ? [...base, { label: 'My account', to: '/account' }] : base
  const onPublicScreen = ['/display', '/login', '/live'].includes(location.pathname)
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
          <Box sx={{ display: { xs: 'none', lg: 'flex' }, gap: 0.5, flexGrow: 1, minWidth: 0 }}>
            {items.map((item) => {
              const isActive = active?.to === item.to
              return (
                <Button
                  key={item.to}
                  onClick={() => go(item.to)}
                  aria-current={isActive ? 'page' : undefined}
                  sx={{
                    color: TEXT.secondary,
                    px: 1.5,
                    whiteSpace: 'nowrap',
                    ...(isActive ? activeSx : {}),
                  }}
                >
                  {item.label}
                </Button>
              )
            })}
          </Box>

          <Box sx={{ flexGrow: { xs: 1, lg: 0 } }} />

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
              onClick={logout}
            >
              <Logout />
            </IconButton>
          </Tooltip>

          <IconButton
            color="inherit"
            aria-label="Open menu"
            edge="end"
            onClick={() => setDrawerOpen(true)}
            sx={{ display: { xs: 'inline-flex', lg: 'none' } }}
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
