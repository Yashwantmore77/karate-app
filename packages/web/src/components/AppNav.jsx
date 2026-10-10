import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Box, Button, IconButton, Drawer, List, ListItemButton,
  ListItemText, Typography, Divider, Chip, Tooltip,
} from '@mui/material'
import { Menu as MenuIcon, Logout, InstallMobile, HelpOutlineOutlined as HelpOutline } from '@mui/icons-material'
import GuideDialog from './help/GuideDialog'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { useSession } from '../state/SessionContext'
import { CYAN, TEXT } from '../theme/tokens'
import { useConnection } from '../state/ConnectionContext'
import { ROLE_LABEL } from '@kumite/shared/permissions.js'

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
    { label: 'Dashboard', to: '/admin/dashboard', tip: 'Every tournament at a glance: entries, weigh-ins, bouts and what needs doing.' },
    { label: 'Tournaments', to: '/admin', tip: 'Create a tournament, or open one to manage it.' },
    { label: 'Analytics', to: '/admin/analytics', tip: 'Results across tournaments: clubs, athletes and medals.' },
    // The referee screens, which an admin may also use: scheduling, panels,
    // the draw, and deleting a bout.
    { label: 'Matches', to: '/referee', tip: 'The bouts you can score or manage, by category.' },
    { label: 'Accounts', to: '/admin/accounts', tip: 'Staff accounts: referees, judges, officers and organisers, and their roles.' },
    { label: 'Sign-ins', to: '/admin/sign-ins', tip: 'Who signed in, when and from where (failed attempts too).' },
    { label: 'System', to: '/admin/system', tip: 'Backups and the system-wide audit log.' },
    { label: 'Scoreboard', to: '/display', tip: 'The hall scoreboard for the big screen (opens full screen).' },
    { label: 'Live board', to: '/live', tip: 'Every mat: the bout on it and what comes next, for a screen in the hall.' },
    { label: 'Public site', to: '/tournaments', tip: 'The public website: tournaments, draws, live bouts and results.' },
  ],
  tournament_owner: [
    { label: 'My tournaments', to: '/tournament_owner', tip: 'The tournaments you have been given. Open one to run it.' },
    { label: 'Analytics', to: '/tournament_owner/analytics', tip: 'Results across your tournaments: clubs, athletes and medals.' },
    { label: 'Live board', to: '/live', tip: 'Every mat: the bout on it and what comes next, for a screen in the hall.' },
    { label: 'Public site', to: '/tournaments', tip: 'The public website: tournaments, draws, live bouts and results.' },
  ],
  registration_officer: [
    { label: 'Registrations', to: '/registration_officer', tip: 'Check and approve the players registered by coaches.' },
    { label: 'Public site', to: '/tournaments', tip: 'The public website: tournaments, draws, live bouts and results.' },
  ],
  weighin_officer: [
    { label: 'Weigh-in', to: '/weighin_officer', tip: 'Record each kumite player\'s weight on the day.' },
    { label: 'Public site', to: '/tournaments', tip: 'The public website: tournaments, draws, live bouts and results.' },
  ],
  referee: [
    { label: 'Matches', to: '/referee', tip: 'The bouts you can score or manage, by category.' },
    { label: 'Scoreboard', to: '/display', tip: 'The hall scoreboard for the big screen (opens full screen).' },
  ],
  judge: [
    { label: 'Matches', to: '/judge', tip: 'The bouts you are judging.' },
    { label: 'Kata scoring', to: '/judge/kata', tip: 'Score kata performers when a round you judge is open.' },
    { label: 'Scoreboard', to: '/display', tip: 'The hall scoreboard for the big screen (opens full screen).' },
  ],
  announcer: [
    { label: 'Call matches', to: '/announcer', tip: 'Call the next bout to each mat and mark who reported.' },
    { label: 'Live board', to: '/live', tip: 'Every mat: the bout on it and what comes next, for a screen in the hall.' },
    { label: 'Public site', to: '/tournaments', tip: 'The public website: tournaments, draws, live bouts and results.' },
  ],
  // PRD v1 §4: runs the hall screens.
  scoreboard_operator: [
    { label: 'Scoreboard control', to: '/scoreboard_operator', tip: 'Choose what the hall scoreboards show.' },
    { label: 'Scoreboard', to: '/display', tip: 'The hall scoreboard for the big screen (opens full screen).' },
    { label: 'Live board', to: '/live', tip: 'Every mat: the bout on it and what comes next, for a screen in the hall.' },
  ],
  coach: [
    { label: 'My team', to: '/coach', tip: 'Your team, players, draw and results.' },
    { label: 'Public site', to: '/tournaments', tip: 'The public website: tournaments, draws, live bouts and results.' },
  ],
  viewer: [
    { label: 'Tournaments', to: '/viewer' },
    { label: 'Analytics', to: '/viewer/analytics' },
    { label: 'Live board', to: '/live', tip: 'Every mat: the bout on it and what comes next, for a screen in the hall.' },
    { label: 'Public site', to: '/tournaments', tip: 'The public website: tournaments, draws, live bouts and results.' },
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
  const [guideOpen, setGuideOpen] = useState(false)
  const { canInstall, install } = useInstallPrompt()
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
                  data-tip={item.tip}
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
            label={ROLE_LABEL[profile.role] || profile.role}
            size="small"
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 1, textTransform: 'capitalize' }}
          />

          {/* The step-by-step guide, from any page: what to do, in what order. */}
          <Button color="inherit" startIcon={<HelpOutline />} onClick={() => setGuideOpen(true)} sx={{ mr: 0.5, minWidth: 0, px: { xs: 1, sm: 1.5 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }} aria-label="Guide">
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Guide</Box>
          </Button>

          {canInstall && (
            <IconButton color="inherit" aria-label="Install app" onClick={install} sx={{ mr: 0.5 }}><InstallMobile /></IconButton>
          )}

          <IconButton color="inherit" aria-label="Sign out" onClick={logout}>
            <Logout />
          </IconButton>

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
            {ROLE_LABEL[profile.role] || profile.role}
          </Typography>
          <Divider sx={{ mt: 1 }} />
          <List>
            {items.map((item) => {
              const isActive = active?.to === item.to
              return (
                <ListItemButton
                  key={item.to}
                  data-tip={item.tip}
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
      <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} role={profile.role} />
    </>
  )
}
