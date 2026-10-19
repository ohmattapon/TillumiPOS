/**
 * Fetches the release package bytes. The URL always comes from the verified
 * feed, never from a client; the adapter still refuses anything but HTTPS.
 * Throws UPDATE_DOWNLOAD_FAILED when the package cannot be fetched.
 */
export interface IUpdateDownloader {
  download(url: string): Promise<Uint8Array>
}

const updateDownloaderTokenSymbol: unique symbol = Symbol('IUpdateDownloader')
export const updateDownloaderToken = updateDownloaderTokenSymbol.toString()
