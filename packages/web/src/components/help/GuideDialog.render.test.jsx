import { render, screen } from '@testing-library/react'
import GuideDialog from './GuideDialog'

describe('GuideDialog', () => {
  it('heads a Tournament Admin\'s job with the role name, not its key', () => {
    render(<GuideDialog open onClose={() => {}} role="tournament_owner" />)
    expect(screen.getByText('Your job as Tournament Admin')).toBeInTheDocument()
    expect(screen.queryByText(/tournament_owner/)).not.toBeInTheDocument()
  })
})
