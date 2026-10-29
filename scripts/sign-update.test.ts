import 'reflect-metadata'
import { describe, expect, test } from 'bun:test'
import { updateSignedMessage, UPDATE_RELEASE_URL_PREFIX } from '../server/src/domains/update-release'
import { NodeUpdateSignatureVerifier } from '../server/src/modules/update/adapters/signature/update-signature-verifier.adapter'
import { buildSignedFeed, newPublisherKey } from './sign-update'

const url = `${UPDATE_RELEASE_URL_PREFIX}v1.0.1/TillumiPOS-update-1.0.1.zip`
const packageBytes = new TextEncoder().encode('release package bytes')

describe('buildSignedFeed', () => {
  const { privateKeyPem, publicJwk } = newPublisherKey()
  const feed = buildSignedFeed({ packageBytes, version: '1.0.1', url, privateKeyPem })

  test('hashes the package and signs version, hash and url so the shop verifier accepts it', () => {
    expect(feed.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(new NodeUpdateSignatureVerifier(publicJwk).verify(updateSignedMessage(feed), feed.signature)).toBe(true)
  })

  test('the signature does not carry over to another version, hash or url', () => {
    const verifier = new NodeUpdateSignatureVerifier(publicJwk)
    expect(verifier.verify(updateSignedMessage({ ...feed, version: '1.0.2' }), feed.signature)).toBe(false)
    expect(verifier.verify(updateSignedMessage({ ...feed, sha256: '0'.repeat(64) }), feed.signature)).toBe(false)
    expect(verifier.verify(updateSignedMessage({ ...feed, url: `${url}.other` }), feed.signature)).toBe(false)
  })

  test('refuses a url outside our releases and a version that is not a triple', () => {
    expect(() => buildSignedFeed({ packageBytes, version: '1.0.1', url: 'https://evil.example/x.zip', privateKeyPem })).toThrow()
    expect(() => buildSignedFeed({ packageBytes, version: '1.0', url, privateKeyPem })).toThrow()
  })
})
