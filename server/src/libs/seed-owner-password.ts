/** Reject copied configuration examples; the user use case still validates the password policy. */
export function requireSeedOwnerPassword(value: string | undefined): string {
  const password = value ?? ''
  const normalized = password.trim().toLowerCase()
  if (!normalized || normalized === 'choose-a-password-here' || normalized === 'change-me'
    || normalized.startsWith('your-') || normalized === 'admin1234')
    throw new Error('Set SEED_OWNER_PASSWORD to a new password before seeding')
  return password
}
