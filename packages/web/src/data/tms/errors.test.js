import { errorMessage } from '.'

describe('error messages', () => {
  it('words a rate-limited request instead of showing its code', () => {
    expect(errorMessage({ code: 'too_many_requests' })).toBe('Too many requests from this device in the last minute. Wait a minute, then try again.')
  })
})
