// Usage: bun --env-file=.env.test test/openapi-snapshot.ts write|check
// Guards the public contract while the internals are restructured.
import { app } from '../src/app'

const v1BaselinePath = new URL('./openapi-baseline.json', import.meta.url)
const v2BaselinePath = new URL('./openapi-v2-baseline.json', import.meta.url)

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
const document = await response.json() as { paths: Record<string, unknown>; [key: string]: unknown }
const forVersion = (version: 'v1' | 'v2') => ({
  ...document,
  paths: Object.fromEntries(Object.entries(document.paths).filter(([path]) => path.startsWith(`/api/${version}/`))),
})
const currentV1 = JSON.stringify(sortKeys(forVersion('v1')), null, 2) + '\n'
const currentV2 = JSON.stringify(sortKeys(forVersion('v2')), null, 2) + '\n'

if (Bun.argv[2] === 'write') {
  await Bun.write(v2BaselinePath, currentV2)
  console.log('OpenAPI v2 baseline written; v1 baseline preserved')
} else {
  const [baselineV1, baselineV2] = await Promise.all([Bun.file(v1BaselinePath).text(), Bun.file(v2BaselinePath).text()])
  const canonical = (value: string) => JSON.stringify(sortKeys(JSON.parse(value)))
  const differsV1 = canonical(baselineV1) !== canonical(currentV1)
  const differsV2 = canonical(baselineV2) !== canonical(currentV2)
  if (differsV1 || differsV2) {
    if (differsV1) await Bun.write(new URL('./openapi-v1-current.json', import.meta.url), currentV1)
    if (differsV2) await Bun.write(new URL('./openapi-v2-current.json', import.meta.url), currentV2)
    console.error('OpenAPI differs from its versioned baseline; current documents were written under test/openapi-*-current.json')
    process.exit(1)
  }
  console.log('OpenAPI v1 and v2 documents match their baselines')
}
process.exit(0)
