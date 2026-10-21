import { errorMessage } from '.'

describe('error messages', () => {
  it('words a rate-limited request instead of showing its code', () => {
    expect(errorMessage({ code: 'too_many_requests' })).toBe('Too many requests from this device in the last minute. Wait a minute, then try again.')
  })

  it('words the organisation form refusals instead of showing "invalid name" (KAN-376)', () => {
    expect(errorMessage({ code: 'invalid_name' })).toBe('The name is missing, too short or too long.')
    expect(errorMessage({ code: 'invalid_slug' })).toBe('A short name uses only lowercase letters, numbers and hyphens, with no spaces.')
  })
})
