import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'

// KAN-430: a registration link is shared by every coach in a tournament, so
// it names none of them on its own - the email given when opening it is
// what does. Reopening the link with the same email must resume that
// coach's own team, never start a second one; an email that already has a
// coach login must be sent to sign in instead of opening a link session at
// all.

let http, port

const call = async (method, path, body, token) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}
const login = async (email, password = 'test123') => (await call('POST', '/auth/login', { email, password })).body.token

const READY = {
  organizer: 'State Karate Association', venue: 'Pune', startDate: '2027-01-15', endDate: '2099-12-31',
  registrationStart: '2020-01-01', registrationClose: '2099-12-31', contactMobile: '+91 98765 43210', contactEmail: 'office@open.example', country: 'India',
}

const setUpTournament = async (admin) => {
  const { body: { tournament } } = await call('POST', '/tournaments', {
    name: `Open ${Date.now()}`, location: 'Pune', date: '2027-01-15', template: 'kumite',
    masterAgeDate: '2027-01-01', type: 'kumite', ...READY,
  }, admin)
  const t = tournament.id
  await call('POST', `/tournaments/${t}/lifecycle`, { to: 'REGISTRATION_OPEN' }, admin)
  const { body: { link } } = await call('PUT', `/tournaments/${t}/registration-link`, { password: 'dojo-pass' }, admin)
  return { t, link }
}

const openSession = (link, email) => call('POST', `/public/register/${link.token}/session`, { password: 'dojo-pass', email })

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
})
afterEach(() => new Promise((resolve) => http.close(resolve)))

describe('coach identity on a shared registration link (KAN-430)', () => {
  it('resumes the same team when the link is reopened with the same email, never a second one', async () => {
    const admin = await login('admin@kata.local')
    const { link } = await setUpTournament(admin)

    const first = await openSession(link, 'coach@dojo.example')
    expect(first.body).not.toHaveProperty('hasAccount')
    const created = await call('POST', '/coach/team', { name: 'ABC Karate', email: 'coach@dojo.example' }, first.body.token)
    expect(created.status).toBe(201)

    // Closing the tab and reopening the link - no token carried over, only
    // the same email typed again.
    const second = await openSession(link, 'coach@dojo.example')
    const me = await call('GET', '/coach/me', undefined, second.body.token)
    expect(me.body.team).toMatchObject({ id: created.body.team.id, name: 'ABC Karate' })

    // Trying to register again under that resumed session is still refused
    // by the existing team_already_registered check - belt and braces.
    const again = await call('POST', '/coach/team', { name: 'A Second Team', email: 'coach@dojo.example' }, second.body.token)
    expect(again.body.error).toBe('team_already_registered')
  })

  it('leaves a different coach on the same link free to register their own, different team', async () => {
    const admin = await login('admin@kata.local')
    const { link } = await setUpTournament(admin)

    const a = await openSession(link, 'coach-a@dojo.example')
    await call('POST', '/coach/team', { name: 'Team A', email: 'coach-a@dojo.example' }, a.body.token)

    const b = await openSession(link, 'coach-b@dojo.example')
    const createdB = await call('POST', '/coach/team', { name: 'Team B', email: 'coach-b@dojo.example' }, b.body.token)
    expect(createdB.status).toBe(201)
  })

  it('sends a coach who already created a login to sign in instead of opening a link session', async () => {
    const admin = await login('admin@kata.local')
    const { link } = await setUpTournament(admin)

    const first = await openSession(link, 'coach@dojo.example')
    const created = await call('POST', '/coach/team', { name: 'ABC Karate', email: 'coach@dojo.example' }, first.body.token)
    await call('POST', '/coach/account', { email: 'coach@dojo.example', password: 'coachpass1' }, created.body.token)

    const reopened = await openSession(link, 'coach@dojo.example')
    expect(reopened.body).toEqual({ hasAccount: true })

    // And the account itself signs in and reaches the same team normally.
    const signedIn = await login('coach@dojo.example', 'coachpass1')
    const me = await call('GET', '/coach/me', undefined, signedIn)
    expect(me.body.team).toMatchObject({ name: 'ABC Karate' })
  })

  it('still opens a fresh, unresolved session when no email is given, as before this change', async () => {
    const admin = await login('admin@kata.local')
    const { link } = await setUpTournament(admin)
    const { body } = await call('POST', `/public/register/${link.token}/session`, { password: 'dojo-pass' })
    expect(body).not.toHaveProperty('hasAccount')
    const me = await call('GET', '/coach/me', undefined, body.token)
    expect(me.body.team).toBeNull()
  })
})
