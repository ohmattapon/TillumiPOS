// Runs the fake KBank by hand so a developer can try the till's QR payment without a bank account:
// `bun run dev:fake-kbank`, then point the API's KBANK_* settings at it with the lines printed below.
Bun.env.FAKE_KBANK_PORT ??= '4010'
const CONTROL_PORT = Number(Bun.env.FAKE_KBANK_CONTROL_PORT ?? 4011)

// Imported after the port is set: the fake reads it once, when the module loads.
const { fakeKbank } = await import('./kbank-server')
const { kbankDevControl } = await import('./kbank-dev-control')

Bun.serve({ port: CONTROL_PORT, fetch: kbankDevControl(fakeKbank) })

const env: Record<string, string | undefined> = {}
fakeKbank.enableIn(env)
console.log('Fake KBank is running. Put these in .env (and leave KBANK_TEST_MODE unset), then restart the API:\n')
for (const [key, value] of Object.entries(env)) console.log(`${key}=${value}`)
console.log(`\nPlay the customer at http://localhost:${CONTROL_PORT}`)
