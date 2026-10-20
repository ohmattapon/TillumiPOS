import type { RequestHandler } from 'msw'

// Static showcase handlers, one per feature. Empty for now on purpose: every
// request bypasses to the network (and fails with no server, which is the
// expected Task 1 state). Later tasks only append to this array.
export const handlers: RequestHandler[] = []
