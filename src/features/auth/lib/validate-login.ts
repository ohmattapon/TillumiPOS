export type LoginField = 'username' | 'password'

/** The fields left empty. Only exact empties are flagged; anything typed (even spaces) is the server's call. */
export function validateLoginInput(input: Record<LoginField, string>): LoginField[] {
  const missing: LoginField[] = []
  if (input.username === '') missing.push('username')
  if (input.password === '') missing.push('password')
  return missing
}
