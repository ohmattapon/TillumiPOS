import { describe, expect, test } from 'bun:test'
import { UPDATE_RELEASE_URL_PREFIX, updateSignedMessage } from './update-release'

const release = {
  version: '1.0.1',
  sha256: 'ABCDEF0123456789'.repeat(4),
  url: `${UPDATE_RELEASE_URL_PREFIX}v1.0.1/TillumiPOS-update-1.0.1.zip`,
}

describe('updateSignedMessage', () => {
  test('joins the format tag, version, lowercase hash and url with line feeds', () => {
    expect(updateSignedMessage(release)).toBe(
      ['tillumi-update:v1', '1.0.1', release.sha256.toLowerCase(), release.url].join('\n'),
    )
  })

  test('a hash written in upper or lower case signs the same text', () => {
    expect(updateSignedMessage(release)).toBe(updateSignedMessage({ ...release, sha256: release.sha256.toLowerCase() }))
  })

  test.each([
    ['version', { version: '1.0.2' }],
    ['hash', { sha256: '0'.repeat(64) }],
    ['url', { url: `${UPDATE_RELEASE_URL_PREFIX}v9/other.zip` }],
  ])('changing the %s changes the signed text', (_name, change) => {
    expect(updateSignedMessage({ ...release, ...change })).not.toBe(updateSignedMessage(release))
  })
})
