import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const auditKeys = { all: ['audit'] as const }
export interface AuditFilters { from?: string; to?: string; actorId?: number; action?: string; entityType?: string; entityId?: string; limit?: number; offset?: number }
const fetchLogs = (filters: AuditFilters) => unwrap(api['audit-logs'].get({ query: { limit: 50, offset: 0, ...filters } }))
export type AuditRecord = Awaited<ReturnType<typeof fetchLogs>>['items'][number]
export const auditLogsQuery = (filters: AuditFilters = {}) => queryOptions({ queryKey: [...auditKeys.all, filters], queryFn: () => fetchLogs(filters) })
