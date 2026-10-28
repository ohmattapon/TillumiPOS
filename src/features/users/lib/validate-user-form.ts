export type UserFormField = 'username' | 'displayName' | 'password'
export type UserFormError = 'required' | 'invalid' | 'tooShort'

export interface UserFormInput {
  username: string
  displayName: string
  password: string
  /** Add mode validates the username and requires a password; edit mode skips both. */
  isNew: boolean
}

/** Mirrors the server rule (Elysia schema + UserEntity): trimmed, case-insensitive, 3–32 chars. */
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/i
const MIN_PASSWORD = 8

/**
 * The failing fields and why. Anything typed is judged after the same trim
 * the submit path applies, so a trailing space can never trip the check.
 */
export function validateUserForm(input: UserFormInput): Partial<Record<UserFormField, UserFormError>> {
  const errors: Partial<Record<UserFormField, UserFormError>> = {}
  if (input.isNew) {
    const username = input.username.trim()
    if (username === '') errors.username = 'required'
    else if (!USERNAME_PATTERN.test(username)) errors.username = 'invalid'
  }
  if (input.displayName.trim() === '') errors.displayName = 'required'
  if (input.password === '') {
    if (input.isNew) errors.password = 'required'
  } else if (input.password.length < MIN_PASSWORD) errors.password = 'tooShort'
  return errors
}
