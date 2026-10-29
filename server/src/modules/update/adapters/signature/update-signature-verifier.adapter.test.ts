import { constants, generateKeyPairSync, sign, type JsonWebKey } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { NodeUpdateSignatureVerifier } from './update-signature-verifier.adapter'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey
const signText = (text: string, key = privateKey) =>
  sign('sha256', Buffer.from(text), { key, padding: constants.RSA_PKCS1_PADDING }).toString('base64')

describe('NodeUpdateSignatureVerifier', () => {
  const verifier = new NodeUpdateSignatureVerifier(jwk)

  test('accepts a signature made with the matching private key', () => {
    expect(verifier.verify('release text', signText('release text'))).toBe(true)
  })

  test('refuses the same signature over different text', () => {
    expect(verifier.verify('release text 2', signText('release text'))).toBe(false)
  })

  test('refuses a signature made with another key', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    expect(verifier.verify('release text', signText('release text', other))).toBe(false)
  })

  test('refuses a signature that is not valid base64 data', () => {
    expect(verifier.verify('release text', '%%%')).toBe(false)
    expect(verifier.verify('release text', '')).toBe(false)
  })

  test('refuses when the key itself cannot be used', () => {
    expect(new NodeUpdateSignatureVerifier({ kty: 'RSA', n: 'AA', e: 'AQAB' }).verify('x', signText('x'))).toBe(false)
  })

  test('a build with no publisher key refuses instead of passing', () => {
    const unconfigured = new NodeUpdateSignatureVerifier({ kty: 'RSA', n: '', e: 'AQAB' })
    try {
      unconfigured.verify('release text', signText('release text'))
      throw new Error('expected a throw')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainExternalServiceError)
      expect(error).toMatchObject({ code: 'UPDATE_SIGNING_NOT_CONFIGURED' })
    }
  })
})
