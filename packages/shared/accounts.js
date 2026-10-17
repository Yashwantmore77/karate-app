// The one password rule. The account form, the coach sign-up, the reset page
// and the API all read it from here, so the browser can never allow something
// the server refuses, or name a limit the server does not keep.

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200

/** What is wrong with a password, or null when it is fine. */
export function passwordProblem(password) {
  const pw = String(password ?? '')
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (pw.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`
  return null
}

/** The rule as a validate.js field, for the API's schemas. */
export const PASSWORD_FIELD = { type: 'string', required: true, min: PASSWORD_MIN, max: PASSWORD_MAX, trim: false }
