import { errorMessage, describeError } from '.'

describe('error messages', () => {
  it('words a rate-limited request instead of showing its code', () => {
    expect(errorMessage({ code: 'too_many_requests' })).toBe('Too many requests from this device in the last minute. Wait a minute, then try again.')
  })

  it('words the organisation form refusals instead of showing "invalid name" (KAN-376)', () => {
    expect(errorMessage({ code: 'invalid_name' })).toBe('The name is missing, too short or too long.')
    expect(errorMessage({ code: 'invalid_slug' })).toBe('A short name uses only lowercase letters, numbers and hyphens, with no spaces.')
  })

  it('names the later bracket bouts a correction would contradict (KAN-248)', () => {
    expect(describeError({ code: 'later_bout_decided', details: { matches: ['M-007'] } })).toBe('M-007 already has a result that follows from this bout. Correct that bout first (cancel it if the wrong players fought), then this one.')
    expect(describeError({ code: 'later_bout_decided', details: { matches: ['M-007', 'M-008'] } })).toMatch(/^M-007 and M-008 already have results that follow from this bout. Correct those bouts first/)
  })
})
