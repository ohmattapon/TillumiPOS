/** Every text field is filled, the password is long enough and typed the same twice. The shop type is checked apart. */
export function isSetupFormFilled(form: Record<string, string> & { password: string; confirm: string }): boolean {
  return (
    Object.values(form).every((value) => value.trim() !== '') &&
    form.password.length >= 10 &&
    form.password === form.confirm
  )
}
