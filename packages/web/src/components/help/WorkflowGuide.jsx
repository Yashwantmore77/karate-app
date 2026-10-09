import { useCallback, useEffect, useMemo, useState } from 'react'
import { Paper, Box, Typography, Button, LinearProgress, Stack, Tooltip, Alert, AlertTitle } from '@mui/material'
import { ArrowBack, ArrowForward, MenuBook, ExpandLess, ExpandMore, PlayArrow, CheckCircle } from '@mui/icons-material'
import { tms } from '../../data/tms'
import { onRequest } from '../../data/http'
import { TAB_GUIDE, workflowState } from '../../help/guide'
import GuideDialog from './GuideDialog'

const HIDE_KEY = 'kt:v1:guide-hidden'
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false } }
const writeHidden = (v) => { try { localStorage.setItem(HIDE_KEY, v ? '1' : '0') } catch { /* private mode */ } }

/** One "before / next / do now" box with a Go button when the role can open that tab. */
function StepBox({ label, icon, text, tab, tabLabel, canGo, onGo, highlight }) {
  return (
    <Box
      sx={{
        flex: '1 1 220px', minWidth: 0, p: 1.25, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1,
        border: '1px solid', borderColor: highlight ? 'info.main' : 'divider',
        bgcolor: highlight ? 'rgba(147,255,255,0.08)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: highlight ? 'info.light' : 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: highlight ? 700 : 500 }}>{text}</Typography>
        {tabLabel && <Typography variant="caption" color="text.secondary">in {tabLabel}</Typography>}
      </Box>
      {tab && canGo(tab) && (
        <Button size="small" variant={highlight ? 'contained' : 'outlined'} data-tip={`Opens ${tabLabel || 'the page'} for this step.`} onClick={() => onGo(tab)} startIcon={icon === 'back' ? <ArrowBack /> : null} endIcon={icon === 'back' ? null : <ArrowForward />} sx={{ flexShrink: 0 }}>
          Go
        </Button>
      )}
    </Box>
  )
}

const SHOWN_ITEMS = 3

/**
 * What needs attention, worst first: the actual problem, why it matters, and
 * a button to the tab that fixes it. Always shown, even with help hidden.
 */
function Attention({ items, current, labelOf, canGo, onGo }) {
  const [all, setAll] = useState({})
  if (!items.length) return null
  const worst = items[0].level
  return (
    <Box sx={{ mt: 1.25 }} data-testid="attention">
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: worst === 'error' ? 'error.light' : worst === 'warning' ? 'warning.light' : 'info.light' }}>
        Needs attention ({items.length})
      </Typography>
      <Stack spacing={0.75} sx={{ mt: 0.5 }}>
        {items.map((a) => {
          const here = a.tab === current
          const reachable = !!labelOf(a.tab)
          const list = all[a.id] ? a.items : a.items?.slice(0, SHOWN_ITEMS)
          return (
            <Alert key={a.id} severity={a.level} variant="outlined"
              action={!here && reachable && canGo(a.tab) ? (
                <Button size="small" color="inherit" variant="outlined" endIcon={<ArrowForward />} onClick={() => onGo(a.tab)} sx={{ whiteSpace: 'nowrap' }} data-tip={`Opens the ${labelOf(a.tab)} tab, where this is fixed.`}>{a.action}</Button>
              ) : null}>
              <AlertTitle sx={{ mb: 0.25 }}>{a.title}</AlertTitle>
              <Typography variant="body2">
                {a.detail}
                {here ? ' Fix it on this page.' : reachable ? '' : ` (${a.action}: ask an administrator.)`}
              </Typography>
              {list?.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {list.map((it) => <li key={it}><Typography variant="body2">{it}</Typography></li>)}
                </Box>
              )}
              {a.items?.length > SHOWN_ITEMS && (
                <Button size="small" color="inherit" data-tip={all[a.id] ? 'Shows only the first few.' : 'Shows the whole list.'} onClick={() => setAll({ ...all, [a.id]: !all[a.id] })}>
                  {all[a.id] ? 'Show fewer' : `Show all ${a.items.length}`}
                </Button>
              )}
            </Alert>
          )
        })}
      </Stack>
    </Box>
  )
}

/**
 * The guide bar under the tournament tabs: which page you are on and what it
 * is for, what comes before and after it, and the next step still to do for
 * this tournament. "Full guide" lists every step with a tick when done.
 */
export default function WorkflowGuide({ tournament, version, tabs, current, goTab, role }) {
  const [stats, setStats] = useState(null)
  const [hidden, setHidden] = useState(readHidden)
  const [open, setOpen] = useState(false)
  const tid = tournament.id

  const load = useCallback(() => tms.dashboard(tid).then(setStats).catch(() => setStats({})), [tid])
  useEffect(() => { load() }, [load, version])
  // A save, an approval or a weigh-in can fix a problem (or make one): look again once it is done.
  useEffect(() => {
    let timer = null
    const off = onRequest(({ method }) => (method === 'GET' ? null : () => { clearTimeout(timer); timer = setTimeout(load, 400) }))
    return () => { off(); clearTimeout(timer) }
  }, [load])

  const flow = useMemo(() => workflowState(tournament, stats), [tournament, stats])
  const labelOf = (key) => tabs.find((t) => t.key === key)?.label
  const canGo = (key) => !!labelOf(key) && key !== current?.key
  const guide = TAB_GUIDE[current?.key] || {}
  const toggle = () => { setHidden((h) => { writeHidden(!h); return !h }) }
  const go = (key) => { setOpen(false); goTab(key) }
  const pct = flow.total ? Math.round((flow.doneCount / flow.total) * 100) : 0

  return (
    <Paper variant="outlined" className="no-print" sx={{ p: 1.5, mb: 2, borderColor: 'rgba(147,255,255,0.3)' }} data-testid="workflow-guide">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Box sx={{ flexGrow: 1, minWidth: 200 }}>
          <Typography variant="body2" color="text.secondary">You are on</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{current?.label}</Typography>
        </Box>
        <Tooltip title={`${flow.doneCount} of ${flow.total} steps done for this tournament`}>
          <Box sx={{ width: 160 }}>
            <Typography variant="caption" color="text.secondary">{stats ? `${flow.doneCount} of ${flow.total} steps done` : 'Checking progress…'}</Typography>
            <LinearProgress variant={stats ? 'determinate' : 'indeterminate'} value={pct} color="success" sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        </Tooltip>
        <Button size="small" variant="outlined" startIcon={<MenuBook />} onClick={() => setOpen(true)}>Full guide</Button>
        <Button size="small" color="inherit" onClick={toggle} endIcon={hidden ? <ExpandMore /> : <ExpandLess />} aria-expanded={!hidden}>
          {hidden ? 'Show help' : 'Hide help'}
        </Button>
      </Stack>

      <Attention items={stats?.attention || []} current={current?.key} labelOf={labelOf} canGo={canGo} onGo={go} />

      {!hidden && (
        <>
          {guide.text && <Typography variant="body2" sx={{ mt: 1 }}>{guide.text}</Typography>}
          <Stack direction="row" sx={{ mt: 1.25, gap: 1, flexWrap: 'wrap' }}>
            {guide.before && (
              <StepBox label="⟵ Before this page" icon="back" text={guide.before.text} tab={guide.before.tab} tabLabel={labelOf(guide.before.tab)} canGo={canGo} onGo={go} />
            )}
            {guide.after && (
              <StepBox label="After this page ⟶" text={guide.after.text} tab={guide.after.tab} tabLabel={labelOf(guide.after.tab)} canGo={canGo} onGo={go} />
            )}
            {stats && (flow.next ? (
              <StepBox
                label={<><PlayArrow sx={{ fontSize: 14, verticalAlign: 'text-bottom' }} /> Next step for this tournament</>}
                text={flow.next.title}
                tab={flow.next.tab}
                tabLabel={flow.next.tab === current?.key ? 'this page' : labelOf(flow.next.tab) || flow.next.where}
                canGo={canGo}
                onGo={go}
                highlight
              />
            ) : (
              <StepBox label={<><CheckCircle sx={{ fontSize: 14, verticalAlign: 'text-bottom' }} /> All done</>} text="Every step for this tournament is complete." highlight canGo={canGo} onGo={go} />
            ))}
          </Stack>
        </>
      )}

      <GuideDialog open={open} onClose={() => setOpen(false)} steps={flow.steps} next={flow.next} canGo={(key) => !!labelOf(key)} onGo={go} role={role} />
    </Paper>
  )
}
