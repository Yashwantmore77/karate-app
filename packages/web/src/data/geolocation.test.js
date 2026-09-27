import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { currentCoords } from './geolocation'

const original = {
  geolocation: navigator.geolocation,
  permissions: navigator.permissions,
}

const setNavigator = (key, value) => {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

const grantPermission = (state) =>
  setNavigator('permissions', { query: vi.fn().mockResolvedValue({ state }) })

afterEach(() => {
  setNavigator('geolocation', original.geolocation)
  setNavigator('permissions', original.permissions)
  vi.useRealTimers()
})

describe('currentCoords', () => {
  beforeEach(() => grantPermission('granted'))

  it('returns the fix the browser hands back', async () => {
    setNavigator('geolocation', {
      getCurrentPosition: (onSuccess) =>
        onSuccess({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 24.5 } }),
    })

    await expect(currentCoords()).resolves.toEqual({
      latitude: 19.076,
      longitude: 72.8777,
      accuracy: 24.5,
    })
  })

  it('resolves to null when the person refuses, rather than rejecting', async () => {
    setNavigator('geolocation', {
      getCurrentPosition: (_onSuccess, onError) => onError({ code: 1, message: 'denied' }),
    })

    await expect(currentCoords()).resolves.toBeNull()
  })

  it('does not even ask an account that has already said no', async () => {
    grantPermission('denied')
    const getCurrentPosition = vi.fn()
    setNavigator('geolocation', { getCurrentPosition })

    await expect(currentCoords()).resolves.toBeNull()
    // Otherwise every sign-in would wait out the timeout for a prompt that
    // is never going to appear.
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('gives up rather than holding a sign-in open on a prompt nobody answers', async () => {
    vi.useFakeTimers()
    setNavigator('geolocation', { getCurrentPosition: () => {} })

    const pending = currentCoords()
    await vi.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toBeNull()
  })

  it('returns null where the browser has no geolocation at all', async () => {
    setNavigator('geolocation', undefined)
    await expect(currentCoords()).resolves.toBeNull()
  })

  it('asks anyway when the browser has no Permissions API to consult', async () => {
    setNavigator('permissions', undefined)
    setNavigator('geolocation', {
      getCurrentPosition: (onSuccess) =>
        onSuccess({ coords: { latitude: 1, longitude: 2, accuracy: 3 } }),
    })

    await expect(currentCoords()).resolves.toEqual({ latitude: 1, longitude: 2, accuracy: 3 })
  })
})
