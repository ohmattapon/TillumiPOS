/** Child output can echo a connection string (with its password) in an error; never print it. */
export function redactUrls(text: string): string {
  return text.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[redacted-url]')
}
