import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { baseUrl, client, ok, resetDatabase } from '../../../test/harness'
import { setupCodeToken, type ISetupCode } from '../../modules/setup/applications/ports/setup-code.port'

const store = () => container.resolve<ISetupCode>(setupCodeToken)
let code: string

const body = (overrides: Record<string, unknown> = {}) => ({
  setupCode: code,
  shopName: 'ร้านทดสอบ',
  branchName: 'สาขาแรก',
  username: 'owner',
  displayName: 'เจ้าของร้าน',
  password: 'correct-horse-battery',
  ...overrides,
})

beforeEach(async () => {
  // resetDatabase leaves the shop with a branch and nobody to sign in.
  await resetDatabase()
  code = store().issue()
})

describe('first-run setup', () => {
  test('an empty shop needs setup', async () => {
    expect(ok(await client().setup.get())).toEqual({ needsSetup: true })
  })

  test('the right code makes an owner who is signed in, names the shop and the branch, and ends the setup', async () => {
    const response = await fetch(`${baseUrl}/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ username: 'owner', role: 'owner', displayName: 'เจ้าของร้าน' })
    const session = response.headers.get('set-cookie')!.split(';')[0]!
    expect(session).toContain('session=')

    const me = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: session } })
    expect(me.status).toBe(200)
    const settings = await fetch(`${baseUrl}/settings`, { headers: { cookie: session } })
    expect(await settings.json()).toMatchObject({ shopName: 'ร้านทดสอบ' })
    const branches = await fetch(`${baseUrl}/branches`, { headers: { cookie: session } })
    expect(JSON.stringify(await branches.json())).toContain('สาขาแรก')

    expect(ok(await client().setup.get())).toEqual({ needsSetup: false })
    expect((await client().auth.login.post({ username: 'owner', password: 'correct-horse-battery' })).status).toBe(200)
  })

  test('a wrong code, and no code issued, are refused and make no one', async () => {
    const wrong = await client().setup.post(body({ setupCode: 'WRONGWRONGWR' }))
    store().retire()
    const none = await client().setup.post(body())

    expect(wrong.error?.value).toMatchObject({ code: 'SETUP_CODE_INVALID' })
    expect(none.error?.value).toMatchObject({ code: 'SETUP_CODE_INVALID' })
    expect(ok(await client().setup.get())).toEqual({ needsSetup: true })
  })

  test('five wrong tries lock it, and then even the right code is refused', async () => {
    for (let attempt = 0; attempt < 5; attempt++) await client().setup.post(body({ setupCode: 'WRONGWRONGWR' }))

    const locked = await client().setup.post(body())

    expect(locked.error?.value).toMatchObject({ code: 'SETUP_LOCKED' })
    expect(ok(await client().setup.get())).toEqual({ needsSetup: true })
  })

  test('once done it cannot be done again, whatever the code', async () => {
    ok(await client().setup.post(body()))

    const again = await client().setup.post(body({ username: 'second' }))

    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'SETUP_DONE' })
  })

  test('two setups at the same moment make exactly one owner', async () => {
    const results = await Promise.all([
      client().setup.post(body({ username: 'first' })),
      client().setup.post(body({ username: 'second' })),
    ])

    expect(results.filter((result) => result.status === 200)).toHaveLength(1)
    expect(results.filter((result) => result.status === 409)).toHaveLength(1)
  })

  test('a short password is refused', async () => {
    const result = await client().setup.post(body({ password: 'short' }))

    expect(result.status).toBe(422)
  })
})
