// Publisher tool for shop updates. Run on the release machine, never on a shop machine.
//
//   bun scripts/sign-update.ts keygen --out <private-key.pem>
//     Makes the publisher key pair. The private key goes ONLY to the file you name (keep it off the repo and
//     back it up); the public half is written to server/src/modules/update/update-public-key.json, which you
//     commit and which the setup .exe installs beside the program. Refuses to replace a key that is already set.
//
//   bun scripts/sign-update.ts sign --key <private-key.pem> --package <update.zip> --version 1.0.1 --url <https url> [--out feed.json]
//     Hashes the package, signs version + hash + url, checks the result against the committed public key and
//     writes feed.json (default: print it). Upload the zip and this feed.json to the GitHub Release.
//
// Losing the private key means no shop can ever take another update from you: every shop would need a new setup .exe.
import 'reflect-metadata' // the verifier adapter is a tsyringe class
import { constants, createPrivateKey, createHash, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { updateSignedMessage } from '../server/src/domains/update-release'
import { updateFeedSchema } from '../server/src/modules/update/applications/schemas/update-schemas'
import { NodeUpdateSignatureVerifier } from '../server/src/modules/update/adapters/signature/update-signature-verifier.adapter'

export const PUBLIC_KEY_PATH = resolve(import.meta.dir, '../server/src/modules/update/update-public-key.json')

export interface SignInput {
  packageBytes: Uint8Array
  version: string
  url: string
  privateKeyPem: string
}

/** The feed entry for one release: the package hash plus a publisher signature over version, hash and url. */
export function buildSignedFeed(input: SignInput) {
  const sha256 = createHash('sha256').update(input.packageBytes).digest('hex')
  const message = updateSignedMessage({ version: input.version, sha256, url: input.url })
  const signature = sign('sha256', Buffer.from(message, 'utf8'), {
    key: createPrivateKey(input.privateKeyPem),
    padding: constants.RSA_PKCS1_PADDING,
  }).toString('base64')
  // The same shape the shop will insist on: a bad version or a url outside our releases stops here.
  return updateFeedSchema.parse({ version: input.version, sha256, url: input.url, signature })
}

/** A fresh RSA-3072 pair: the private key as PEM, the public key as the JSON web key the program embeds. */
export function newPublisherKey() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 })
  const jwk = publicKey.export({ format: 'jwk' })
  return {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicJwk: { kty: 'RSA', n: jwk.n as string, e: jwk.e as string },
  }
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}

function need(args: string[], name: string): string {
  const value = flag(args, name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

function keygen(args: string[]) {
  const out = resolve(need(args, 'out'))
  const current = JSON.parse(readFileSync(PUBLIC_KEY_PATH, 'utf8')) as { n?: string }
  if (current.n) throw new Error('A publisher key is already set. Replacing it locks every installed shop out of updates.')
  if (existsSync(out)) throw new Error(`${out} already exists; refusing to overwrite a private key.`)
  const { privateKeyPem, publicJwk } = newPublisherKey()
  writeFileSync(out, privateKeyPem, { mode: 0o600 })
  writeFileSync(PUBLIC_KEY_PATH, `${JSON.stringify(publicJwk, null, 2)}\n`)
  console.log(`Private key written to ${out}. Keep it off the repo and back it up.`)
  console.log(`Public key written to ${PUBLIC_KEY_PATH}. Commit it, then rebuild the setup .exe.`)
}

function signRelease(args: string[]) {
  const feed = buildSignedFeed({
    packageBytes: readFileSync(resolve(need(args, 'package'))),
    version: need(args, 'version'),
    url: need(args, 'url'),
    privateKeyPem: readFileSync(resolve(need(args, 'key')), 'utf8'),
  })
  // The private key must belong to the public key that shops carry, or no shop would accept this release.
  if (!new NodeUpdateSignatureVerifier().verify(updateSignedMessage(feed), feed.signature))
    throw new Error('This private key does not match server/src/modules/update/update-public-key.json.')
  const text = `${JSON.stringify(feed, null, 2)}\n`
  const out = flag(args, 'out')
  if (out) writeFileSync(resolve(out), text)
  else process.stdout.write(text)
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'keygen') keygen(args)
    else if (command === 'sign') signRelease(args)
    else throw new Error('Usage: bun scripts/sign-update.ts keygen|sign ...')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
