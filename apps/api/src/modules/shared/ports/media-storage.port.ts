/** Stores product images. Failures surface as DomainExternalServiceError with code MEDIA_UNAVAILABLE. */
export interface IMediaStorage {
  /** False when no image store is set up: there are no URLs and nothing can be stored. */
  isEnabled(): boolean
  /** Public URL a browser loads the object from; null when images are not set up. */
  urlFor(key: string): string | null
  put(key: string, file: Blob): Promise<void>
  delete(key: string): Promise<void>
}
