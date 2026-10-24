// Preloaded for every `bun test` run, including unit tests, so it must not need a database.
import 'reflect-metadata'
import { fakeMedia } from './media-server'
import { KBANK_ENV_KEYS } from './kbank-server'

// A developer's own KBank settings must never reach a test run: QR payment is off unless a test turns it on.
for (const key of KBANK_ENV_KEYS) delete Bun.env[key]

// Must happen before anything imports src/libs/env, which reads the environment once.
Bun.env.MEDIA_URL = fakeMedia.url
