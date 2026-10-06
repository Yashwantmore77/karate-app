import { useEffect, useState } from 'react'
import { Stack, TextField, Button, Alert, Typography, Box, MenuItem } from '@mui/material'
import { WEIGH_IN_STATUS } from '@kumite/shared/tms.js'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import StatusBadge, { humanize } from '../../components/tms/StatusBadge'

const ELIGIBLE = new Set(['APPROVED', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'WEIGH_IN_PENDING', 'WEIGH_IN_VERIFIED', 'CATEGORY_CONFIRMED'])

/** Section 19: kumite players only, actual weight against registered weight. */
export default function WeighInTab({ tournament, version, action }) {
  const tid = tournament.id
  const [players, setPlayers] = useState([])
  const [weights, setWeights] = useState([])
  const [teams, setTeams] = useState([])
  const [draft, setDraft] = useState({})
  const [status, setStatus] = useState('')

  const load = () => Promise.all([tms.players.list(tid, { event: 'kumite' }), tms.weightCategories.list(tid), tms.teams.list(tid)])
    .then(([p, w, t]) => { setPlayers(p.filter((x) => ELIGIBLE.has(x.registrationStatus) || x.weighIn?.status)); setWeights(w); setTeams(t) })
  useEffect(() => { load() }, [tid, version])

  const category = (p) => {
    const w = weights.find((x) => x.id === p.entries?.kumite?.weightCategoryId)
    return w ? (w.label || w.name) : '—'
  }
  const record = async (p) => {
    const d = draft[p.id] || {}
    const actualWeight = Number(d.weight)
    if (!(actualWeight > 0)) return action.notify({ severity: 'error', text: 'Enter the actual weight' })
    const out = await action.run(() => tms.weighIn(tid, p.id, { actualWeight, notes: d.notes || null, ...(d.status ? { status: d.status } : {}) }),
      (r) => `${p.name}: ${humanize(r.weighIn.status)} — ${category(r)}`)
    if (out) { setDraft({ ...draft, [p.id]: {} }); load() }
  }

  const rows = players.filter((p) => !status || (p.weighIn?.status || 'PENDING') === status)

  return (
    <Stack spacing={2}>
      {tournament.entriesLocked && <Alert severity="info">Entries are locked, so weigh-in is closed.</Alert>}
      <Typography variant="body2" color="text.secondary">
        A player whose actual weight fits another category is {tournament.settings?.weighInAutoMove === false ? 'flagged for a recheck' : 'moved to it automatically'}; every move is audited.
      </Typography>
      <DataTable
        rows={rows}
        empty="No approved kumite players to weigh."
        toolbar={(
          <TextField select size="small" label="Weigh-in status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="">All</MenuItem>
            {WEIGH_IN_STATUS.map((s) => <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>)}
          </TextField>
        )}
        columns={[
          { key: 'name', label: 'Player' },
          { key: 'team', label: 'Team', value: (p) => teams.find((t) => t.id === p.teamId)?.name, render: (p) => teams.find((t) => t.id === p.teamId)?.name || '—' },
          { key: 'registered', label: 'Registered kg', value: (p) => p.weighIn?.registeredWeight ?? p.weight, render: (p) => p.weighIn?.registeredWeight ?? p.weight ?? '—' },
          { key: 'actual', label: 'Actual kg', value: (p) => p.weighIn?.actualWeight, render: (p) => p.weighIn?.actualWeight ?? '—' },
          { key: 'category', label: 'Category', value: category, render: category },
          { key: 'status', label: 'Status', value: (p) => p.weighIn?.status, render: (p) => (
            <Box>
              <StatusBadge status={p.weighIn?.status || 'PENDING'} />
              {p.weighIn?.at && <Typography variant="body2" color="text.secondary">{new Date(p.weighIn.at).toLocaleTimeString()}{p.weighIn.notes ? ` · ${p.weighIn.notes}` : ''}</Typography>}
            </Box>
          ) },
          { key: 'record', label: 'Record', sortable: false, render: (p) => (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 380 }}>
              <TextField size="small" type="number" label="kg" sx={{ width: 90 }} slotProps={{ htmlInput: { step: '0.1' } }} value={draft[p.id]?.weight ?? ''}
                onChange={(e) => setDraft({ ...draft, [p.id]: { ...draft[p.id], weight: e.target.value } })} disabled={tournament.entriesLocked} />
              <TextField size="small" select label="Result" sx={{ width: 110 }} value={draft[p.id]?.status ?? ''}
                onChange={(e) => setDraft({ ...draft, [p.id]: { ...draft[p.id], status: e.target.value } })} disabled={tournament.entriesLocked}>
                <MenuItem value="">Auto</MenuItem>
                {WEIGH_IN_STATUS.filter((s) => s !== 'PENDING').map((s) => <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Notes" sx={{ width: 110 }} value={draft[p.id]?.notes ?? ''}
                onChange={(e) => setDraft({ ...draft, [p.id]: { ...draft[p.id], notes: e.target.value } })} disabled={tournament.entriesLocked} />
              <Button variant="contained" onClick={() => record(p)} disabled={tournament.entriesLocked}>Save</Button>
            </Stack>
          ) },
        ]}
      />
    </Stack>
  )
}
