/** Stores product images. Failures surface as DomainExternalServiceError with code MEDIA_UNAVAILABLE. */
export interface IMediaStorage {
  /** Public URL a browser loads the object from. */
  urlFor(key: string): string
  put(key: string, file: Blob): Promise<void>
  delete(key: string): Promise<void>
}
