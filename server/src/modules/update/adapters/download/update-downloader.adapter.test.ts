import { afterEach, describe, expect, test } from 'bun:test'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { UPDATE_RELEASE_URL_PREFIX } from '../../../../domains/update-release'
import { HttpUpdateDownloader } from './update-downloader.adapter'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const URL_OK = `${UPDATE_RELEASE_URL_PREFIX}v1.0.1/TillumiPOS-update-1.0.1.zip`

/** Replaces fetch for one test; `answer` builds what the "network" returns. */
function fakeFetch(answer: () => unknown) {
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return answer()
  }) as unknown as typeof fetch
  return () => calls
}

const reply = (byteLength: number, init: { ok?: boolean; url?: string } = {}) => ({
  ok: init.ok ?? true,
  url: init.url ?? URL_OK,
  // The size check looks only at byteLength, so a huge package needs no real memory.
  arrayBuffer: async () => (byteLength > 1024 ? ({ byteLength } as ArrayBuffer) : new Uint8Array(byteLength).fill(7).buffer),
})

describe('HttpUpdateDownloader', () => {
  test('returns the package bytes', async () => {
    fakeFetch(() => reply(5))

    expect(await new HttpUpdateDownloader().download(URL_OK)).toEqual(new Uint8Array([7, 7, 7, 7, 7]))
  })

  test.each([
    ['a plain http url', 'http://github.com/x.zip'],
    ['text that is not a url', 'not a url'],
  ])('refuses %s without making a request', async (_label, url) => {
    const calls = fakeFetch(() => reply(5))

    const attempt = new HttpUpdateDownloader().download(url)

    await expect(attempt).rejects.toBeInstanceOf(DomainError)
    await expect(attempt).rejects.toMatchObject({ code: 'UPDATE_FEED_INVALID' })
    expect(calls()).toBe(0)
  })

  test.each([
    ['a network failure', () => { throw new Error('offline') }],
    ['a non-success answer', () => reply(5, { ok: false })],
    ['an answer that ended up on plain http after a redirect', () => reply(5, { url: 'http://cdn.example/x.zip' })],
    ['an empty package', () => reply(0)],
    ['a package over the size limit', () => reply(600 * 1024 * 1024)],
  ])('%s is UPDATE_DOWNLOAD_FAILED', async (_label, answer) => {
    fakeFetch(answer)

    const attempt = new HttpUpdateDownloader().download(URL_OK)

    await expect(attempt).rejects.toBeInstanceOf(DomainExternalServiceError)
    await expect(attempt).rejects.toMatchObject({ code: 'UPDATE_DOWNLOAD_FAILED' })
  })
})
