// Usage: bun --env-file=.env.test test/openapi-snapshot.ts write|check
// Guards the public contract while the internals are restructured.
import { app } from '../src/app'

const baselinePath = new URL('./openapi-baseline.json', import.meta.url)

// Key order is not part of the contract; sort so only real differences show up.
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortKeys(child)]),
  )
}

const response = await app.handle(new Request('http://localhost/openapi/json'))
const current = JSON.stringify(sortKeys(await response.json()), null, 2) + '\n'

if (Bun.argv[2] === 'write') {
  await Bun.write(baselinePath, current)
  console.log('OpenAPI baseline written')
} else {
  // Git on Windows may have checked the baseline out with CRLF line endings; they are not part of the contract.
  const baseline = (await Bun.file(baselinePath).text()).replaceAll('
', '
')
  if (baseline !== current) {
    await Bun.write(new URL('./openapi-current.json', import.meta.url), current)
    console.error('OpenAPI document differs from test/openapi-baseline.json (current written to test/openapi-current.json)')
    process.exit(1)
  }
  console.log('OpenAPI document matches the baseline')
}
process.exit(0)
