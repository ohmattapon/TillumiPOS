import { constants, createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import { injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { IUpdateSignatureVerifier } from '../../applications/ports/update-signature.port'
import publisherKey from '../../update-public-key.json'

/**
 * RSA PKCS#1 v1.5 with SHA-256 against the publisher key in `update-public-key.json`. The same file
 * is installed beside the program by the setup .exe, where `apply-update.ps1` reads it, so the key
 * lives in one place. RSA because Windows PowerShell 5.1 can verify it without extra software.
 */
@injectable()
export class NodeUpdateSignatureVerifier implements IUpdateSignatureVerifier {
  constructor(private readonly key: JsonWebKey = publisherKey) {}

  verify(message: string, signatureBase64: string): boolean {
    if (!this.key.n)
      throw new DomainExternalServiceError(
        'โปรแกรมนี้ยังไม่มีกุญแจตรวจลายเซ็นอัปเดต กรุณาแจ้งช่าง',
        'UPDATE_SIGNING_NOT_CONFIGURED',
      )
    try {
      return verify(
        'sha256',
        Buffer.from(message, 'utf8'),
        { key: createPublicKey({ key: this.key, format: 'jwk' }), padding: constants.RSA_PKCS1_PADDING },
        Buffer.from(signatureBase64, 'base64'),
      )
    } catch {
      return false
    }
  }
}
