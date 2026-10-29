// The part of k6's API these scripts use. k6 has no @types package in this repo and none is added as a dependency.
declare const __ENV: Record<string, string | undefined>
declare const __VU: number
declare const __ITER: number

declare module 'k6' {
  export function check<T>(value: T, checks: Record<string, (value: T) => boolean>, tags?: Record<string, string>): boolean
  export function sleep(seconds: number): void
  export function fail(message: string): never
}

declare module 'k6/http' {
  export interface Response {
    status: number
    body: string | null
    json(selector?: string): any
  }
  export class CookieJar {}
  export interface Params {
    headers?: Record<string, string>
    tags?: Record<string, string>
    jar?: CookieJar
    responseCallback?: unknown
  }
  export function expectedStatuses(...statuses: number[]): unknown
  export function request(method: string, url: string, body?: string | null, params?: Params): Response
  const http: { CookieJar: typeof CookieJar; expectedStatuses: typeof expectedStatuses; request: typeof request }
  export default http
}

declare module 'k6/metrics' {
  export class Rate {
    constructor(name: string)
    add(value: boolean | number, tags?: Record<string, string>): void
  }
}

declare module 'k6/crypto' {
  export function randomBytes(size: number): ArrayBuffer
}
