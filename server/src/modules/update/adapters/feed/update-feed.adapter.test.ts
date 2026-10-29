import { afterEach, describe, expect, test } from 'bun:test'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { UPDATE_RELEASE_URL_PREFIX } from '../../../../domains/update-release'
import { HttpUpdateFeed, UPDATE_FEED_URL } from './update-feed.adapter'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const good = {
  version: '1.0.1',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  url: `${UPDATE_RELEASE_URL_PREFIX}v1.0.1/TillumiPOS-update-1.0.1.zip`,
  signature: 'A'.repeat(512),
}

/** Replaces fetch for one test; `answer` builds what the "network" returns. */
function fakeFetch(answer: () => unknown) {
  const calls: string[] = []
  globalThis.fetch = (async (input: unknown) => {
    calls.push(String(input))
    return answer()
  }) as unknown as typeof fetch
  return calls
}

const reply = (body: unknown, init: { ok?: boolean; url?: string } = {}) => ({
  ok: init.ok ?? true,
  url: init.url ?? UPDATE_FEED_URL,
  json: async () => body,
})

const failsWith = async (code: string) => {
  const attempt = new HttpUpdateFeed().fetchFeed()
  await expect(attempt).rejects.toBeInstanceOf(DomainExternalServiceError)
  await expect(attempt).rejects.toMatchObject({ code })
}

describe('HttpUpdateFeed', () => {
  test('reads the fixed feed url and returns the release', async () => {
    const calls = fakeFetch(() => reply(good))

    expect(await new HttpUpdateFeed().fetchFeed()).toEqual(good)
    expect(calls).toEqual([UPDATE_FEED_URL])
  })

  test('drops documentation keys such as the template note', async () => {
    fakeFetch(() => reply({ ...good, _note: 'for people only' }))

    expect(await new HttpUpdateFeed().fetchFeed()).toEqual(good)
  })

  test('a network failure is UPDATE_FEED_UNAVAILABLE', async () => {
    fakeFetch(() => {
      throw new Error('offline')
    })

    await failsWith('UPDATE_FEED_UNAVAILABLE')
  })

  test('a non-success answer is UPDATE_FEED_UNAVAILABLE', async () => {
    fakeFetch(() => reply({}, { ok: false }))

    await failsWith('UPDATE_FEED_UNAVAILABLE')
  })

  test('an answer that ended up on plain http after a redirect is refused', async () => {
    fakeFetch(() => reply(good, { url: 'http://github.com/feed.json' }))

    await failsWith('UPDATE_FEED_UNAVAILABLE')
  })

  test('a body that is not JSON is UPDATE_FEED_INVALID', async () => {
    fakeFetch(() => ({
      ok: true,
      url: UPDATE_FEED_URL,
      json: async () => {
        throw new SyntaxError('not json')
      },
    }))

    await failsWith('UPDATE_FEED_INVALID')
  })

  test.each([
    ['a wrong shape', { version: '1.0.1' }],
    ['a package url on another host', { ...good, url: 'https://evil.example/x.zip' }],
    ['no signature', { ...good, signature: undefined }],
  ])('%s is UPDATE_FEED_INVALID', async (_label, body) => {
    fakeFetch(() => reply(body))

    await failsWith('UPDATE_FEED_INVALID')
  })
})
