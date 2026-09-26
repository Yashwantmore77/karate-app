// The match clock is a pure function of time, not replicated ticking state.
// Only these three fields travel between devices; each renders locally from them.

export const makeClock = (durationMs) => ({
  running: false,
  remainingMs: durationMs,
  startedAt: null,
})

export const remainingNow = (clock, serverNow) =>
  clock.running
    ? Math.max(0, clock.remainingMs - (serverNow - clock.startedAt))
    : Math.max(0, clock.remainingMs)

export const startClock = (clock, serverNow) =>
  clock.running || remainingNow(clock, serverNow) === 0
    ? clock
    : { running: true, remainingMs: clock.remainingMs, startedAt: serverNow }

export const stopClock = (clock, serverNow) =>
  clock.running
    ? { running: false, remainingMs: remainingNow(clock, serverNow), startedAt: null }
    : clock

export const adjustClock = (clock, deltaMs, serverNow) => {
  const next = Math.max(0, remainingNow(clock, serverNow) + deltaMs)
  return clock.running
    ? { running: true, remainingMs: next, startedAt: serverNow }
    : { running: false, remainingMs: next, startedAt: null }
}

export const setClock = (clock, durationMs, serverNow) =>
  clock.running
    ? { running: true, remainingMs: durationMs, startedAt: serverNow }
    : { running: false, remainingMs: durationMs, startedAt: null }

export const hasExpired = (clock, serverNow) => remainingNow(clock, serverNow) === 0
