import { t } from 'elysia'

export const updateSchemas = {
  status: t.Object({
    supported: t.Boolean(),
    currentVersion: t.String(),
    latestVersion: t.Nullable(t.String()),
    updateAvailable: t.Boolean(),
  }),
  staged: t.Object({
    staged: t.Boolean(),
    version: t.String(),
  }),
}

export type UpdateStatusResponse = typeof updateSchemas.status.static
export type StagedUpdateResponse = typeof updateSchemas.staged.static
