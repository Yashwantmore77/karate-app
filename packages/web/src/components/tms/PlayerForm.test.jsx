import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlayerForm from './PlayerForm'
import { DEFAULT_FIELDS, TEAM_PROFILE_KEYS } from '@kumite/shared/registration.js'

const fields = [...TEAM_PROFILE_KEYS, 'belt'].map((key) => DEFAULT_FIELDS.find((field) => field.key === key))

describe('PlayerForm team profile fields', () => {
  it('hides team profile fields from coach player entry while leaving Belt visible', () => {
    render(<PlayerForm coach fields={fields} value={{}} onChange={() => {}} />)

    for (const key of TEAM_PROFILE_KEYS) {
      expect(screen.queryByLabelText(new RegExp(DEFAULT_FIELDS.find((field) => field.key === key).label))).not.toBeInTheDocument()
    }
    expect(screen.getByLabelText('Belt')).toBeInTheDocument()
  })

  it('keeps team profile fields available to organisers', () => {
    render(<PlayerForm fields={fields} value={{}} onChange={() => {}} />)

    for (const key of TEAM_PROFILE_KEYS) {
      expect(screen.getByLabelText(new RegExp(DEFAULT_FIELDS.find((field) => field.key === key).label))).toBeInTheDocument()
    }
  })
})
