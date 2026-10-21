import { useEffect, useState } from 'react'
import { Container, Typography, Button } from '@mui/material'
import { tournaments as tournamentStore } from '../../data/domain'
import StatusBadge from './StatusBadge'
import DataTable from './DataTable'
import { PageLoader } from '../Loader'
import { HelpTitle } from '../help/InfoTip'

const dayOf = (t) => String(t.startDate || t.date || '').slice(0, 10)

/** Section 63.6's TournamentSelector: officers pick the event they are working, one row each. */
export default function TournamentSelector({ title = 'Choose a tournament', onPick }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { tournamentStore.list().then(setRows).catch(() => setRows([])) }, [])
  const columns = [
    { key: 'name', label: 'Tournament', render: (t) => <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 200 }}>{t.name}</Typography> },
    { key: 'location', label: 'Venue', render: (t) => <span style={{ whiteSpace: 'nowrap' }}>{t.location || '—'}</span> },
    { key: 'date', label: 'Date', value: dayOf, render: (t) => <span style={{ whiteSpace: 'nowrap' }}>{dayOf(t) || '—'}</span> },
    { key: 'stage', label: 'Stage', value: (t) => t.lifecycleStatus || 'DRAFT', render: (t) => <StatusBadge status={t.lifecycleStatus || 'DRAFT'} /> },
    // The row opens on a click too; the button is there for the keyboard.
    { key: 'actions', label: '', sortable: false, align: 'right', render: (t) => <Button size="small" variant="outlined" data-tip="Opens this tournament to work on it" onClick={(e) => { e.stopPropagation(); onPick(t) }}>Open</Button> },
  ]
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <HelpTitle id="tournament.select" variant="h1" sx={{ mb: 3 }}>{title}</HelpTitle>
      {!rows ? <PageLoader label="Loading tournaments…" /> : (
        <DataTable columns={columns} rows={rows} onRowClick={onPick} canExport={false}
          searchPlaceholder="Search tournament or venue" empty="No tournaments yet." />
      )}
    </Container>
  )
}
