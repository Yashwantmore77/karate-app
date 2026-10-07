import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Container, Box, Toolbar, Typography, IconButton, Tabs, Tab, Alert, Stack } from '@mui/material'
import { ArrowBack, Lock, LockOpen } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import StatusBadge from '../../components/tms/StatusBadge'
import useAction from '../../components/tms/useAction'
import { tournaments as tournamentStore } from '../../data/domain'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import OverviewTab from './OverviewTab'
import SetupTab from './SetupTab'
import CategoriesTab from './CategoriesTab'
import RegistrationsTab from './RegistrationsTab'
import WeighInTab from './WeighInTab'
import DrawTab from './DrawTab'
import MatchesTab from './MatchesTab'
import KataTab from './KataTab'
import CallTab from './CallTab'
import ResultsTab from './ResultsTab'
import CertificatesTab from './CertificatesTab'
import ReportsTab from './ReportsTab'
import AuditTab from './AuditTab'
import CheckinTab from './CheckinTab'
import { PageLoader } from '../../components/Loader'
import { ExportAuditContext } from '../../components/tms/exportAudit'
import { tms } from '../../data/tms'
import WorkflowGuide from '../../components/help/WorkflowGuide'

// PRD section 51's admin navigation, as tabs on one tournament. A tab shows
// only when the signed-in role holds its permission (section 3).
export const TABS = [
  { key: 'overview', label: 'Dashboard', perm: P.REGISTRATION_VIEW, Component: OverviewTab },
  { key: 'setup', label: 'Settings', perm: P.TOURNAMENT_MANAGE, Component: SetupTab },
  { key: 'categories', label: 'Categories', perm: P.CATEGORY_CONFIGURE, Component: CategoriesTab },
  { key: 'registrations', label: 'Registrations', perm: P.REGISTRATION_VIEW, Component: RegistrationsTab },
  { key: 'weighin', label: 'Weigh-in', perm: P.WEIGHIN_RECORD, Component: WeighInTab },
  { key: 'draw', label: 'Draw / Pools', perm: P.POOL_MANAGE, Component: DrawTab },
  { key: 'matches', label: 'Matches', perm: P.MATCH_GENERATE, Component: MatchesTab },
  { key: 'kata', label: 'Kata panel', perm: P.MATCH_GENERATE, Component: KataTab },
  { key: 'call', label: 'Call matches', perm: P.MATCH_CALL, Component: CallTab },
  // Passes and QR check-in: the door (registration, weigh-in) and the mat.
  { key: 'checkin', label: 'Check-in & passes', perm: [P.ATTENDANCE_MARK, P.WEIGHIN_RECORD, P.CERTIFICATE_GENERATE], Component: CheckinTab },
  { key: 'results', label: 'Results', perm: P.RESULT_MANAGE, Component: ResultsTab },
  { key: 'certificates', label: 'Certificates', perm: P.CERTIFICATE_GENERATE, Component: CertificatesTab },
  { key: 'reports', label: 'Reports', perm: P.REPORT_EXPORT, Component: ReportsTab },
  { key: 'audit', label: 'Audit log', perm: P.AUDIT_VIEW, Component: AuditTab },
]

export default function TournamentManager({ uid, profile, basePath = '/admin' }) {
  const navigate = useNavigate()
  const { tournamentId } = useParams()
  const [params, setParams] = useSearchParams()
  const [tournament, setTournament] = useState(null)
  const [missing, setMissing] = useState(false)
  const [version, setVersion] = useState(0)
  const action = useAction()
  // PRD v1 §4: an account may hold a different role inside this one tournament.
  const role = profile?.tournamentRoles?.[tournamentId] || profile?.role || 'admin'
  const logExport = useCallback((entry) => tms.logExport(tournamentId, entry), [tournamentId])

  const reload = useCallback(async () => {
    const t = await tournamentStore.get(tournamentId)
    if (!t) setMissing(true)
    setTournament(t)
    setVersion((v) => v + 1)
    return t
  }, [tournamentId])

  useEffect(() => { reload() }, [reload])

  const tabs = useMemo(() => TABS.filter((t) => [].concat(t.perm).some((p) => can(role, p))), [role])
  const current = tabs.find((t) => t.key === params.get('tab')) || tabs[0]

  if (missing) return <Container sx={{ py: 4 }}><Alert severity="error">Tournament not found.</Alert></Container>
  if (!tournament) return <PageLoader label="Loading tournament…" />

  const Current = current?.Component
  const status = tournament.lifecycleStatus || 'DRAFT'

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <PageBar>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
          <IconButton color="inherit" aria-label="Back" onClick={() => navigate(basePath === '/admin' ? `/admin/tournament/${tournamentId}` : basePath)}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h2" noWrap>{tournament.name}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {[tournament.venue || tournament.location, tournament.startDate || tournament.date, tournament.masterAgeDate && `Ages as of ${tournament.masterAgeDate}`].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <StatusBadge status={status} />
            <StatusBadge status={tournament.entriesLocked ? 'COMPLETED' : 'DRAFT'} label={tournament.entriesLocked ? 'Entries locked' : 'Entries open'} />
            <StatusBadge status={tournament.drawLocked ? 'COMPLETED' : 'DRAFT'} label={tournament.drawLocked ? 'Draw locked' : 'Draw open'} />
            {tournament.softLocked && !tournament.entriesLocked && <StatusBadge status="PENDING_VERIFICATION" label="Coach entries closed" />}
            {tournament.weighInClosed && <StatusBadge status="COMPLETED" label="Weigh-in closed" />}
          </Stack>
        </Toolbar>
        <Tabs value={current?.key || false} onChange={(_e, key) => setParams({ tab: key })} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ px: 1 }}>
          {tabs.map((t) => <Tab key={t.key} value={t.key} label={t.label} />)}
        </Tabs>
      </PageBar>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        {current && <WorkflowGuide tournament={tournament} version={version} tabs={tabs} current={current} goTab={(key) => setParams({ tab: key })} role={role} />}
        <ExportAuditContext.Provider value={logExport}>
          {Current && <Current key={current.key} tournament={tournament} reload={reload} version={version} action={action} role={role} goTab={(key) => setParams({ tab: key })} />}
        </ExportAuditContext.Provider>
      </Container>
      {action.feedback}
    </Box>
  )
}

export const LockIcon = ({ locked }) => (locked ? <Lock fontSize="small" /> : <LockOpen fontSize="small" />)
