// Preloaded for every `bun test` run, including unit tests, so it must not need a database.
import 'reflect-metadata'
import { fakeMedia } from './media-server'

// Must happen before anything imports src/libs/env, which reads the environment once.
Bun.env.MEDIA_URL = fakeMedia.url
