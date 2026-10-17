import { env } from '../../../libs/env'
import type { MediaStorageMode } from '../../../libs/media-storage-mode'
import type { IMediaStorage } from '../ports/media-storage.port'
import { DisabledMediaStorage } from './disabled-media-storage'
import { LocalDiskMediaStorage } from './local-disk-media-storage'
import { WorkerMediaStorage } from './worker-media-storage'

interface MediaStorageSettings {
  mediaStorage: MediaStorageMode
  mediaDir: string
  mediaUrl: string | null
  mediaToken: string | null
}

/** The one place that turns the MEDIA_STORAGE choice into an adapter. */
export function createMediaStorage(settings: MediaStorageSettings = env): IMediaStorage {
  if (settings.mediaStorage === 'worker') return new WorkerMediaStorage(settings)
  if (settings.mediaStorage === 'local') return new LocalDiskMediaStorage(settings.mediaDir)
  return new DisabledMediaStorage()
}
