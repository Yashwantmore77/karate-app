import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The screen is about which document it prints, so the data module is stubbed;
// the PDF itself is built and covered on the server.
const data = vi.hoisted(() => ({ pdfBlob: vi.fn(), describeError: vi.fn(() => 'Something went wrong.') }))
vi.mock('../../data/tms', () => ({ tms: { pdfBlob: data.pdfBlob }, describeError: data.describeError }))

const CertificatesPrint = (await import('./CertificatesPrint')).default

const show = () => render(
  <MemoryRouter initialEntries={['/admin/tournament/t1/certificates/print']}>
    <Routes>
      <Route path="/admin/tournament/:tournamentId/certificates/print" element={<CertificatesPrint />} />
    </Routes>
  </MemoryRouter>,
)

describe('CertificatesPrint', () => {
  beforeEach(() => {
    data.pdfBlob.mockReset().mockResolvedValue(new Blob(['%PDF-1.3'], { type: 'application/pdf' }))
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:certificates')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  it('prints the PDF the server built, not a second rendering of its own', async () => {
    show()
    await waitFor(() => expect(screen.getByTitle('Certificates')).toBeInTheDocument())
    expect(data.pdfBlob).toHaveBeenCalledWith('t1', 'certificates.pdf')
    expect(screen.getByTitle('Certificates')).toHaveAttribute('src', 'blob:certificates')
    // The wording of a certificate belongs to the server renderer alone: a
    // participation or special award must not come out as a medal here.
    expect(screen.queryByText(/medal/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/certificate of achievement/i)).not.toBeInTheDocument()
  })

  it('says so when the certificates cannot be fetched', async () => {
    data.pdfBlob.mockRejectedValue({ code: 'forbidden' })
    show()
    await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeInTheDocument())
    expect(screen.queryByTitle('Certificates')).not.toBeInTheDocument()
  })
})
