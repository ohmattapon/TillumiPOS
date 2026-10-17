import { container } from 'tsyringe'
import { AuditElysiaController } from './adapters/controllers/audit.controller'
import { DrizzleAuditLogRepository } from './adapters/repository/audit-log.drizzle.repository'
import { auditLogToken } from './applications/ports/audit-log.port'
import { ListAuditLogsUseCase } from './applications/usecases/list-audit-logs.usecase'

container.register(auditLogToken, { useClass: DrizzleAuditLogRepository })
container.registerSingleton(ListAuditLogsUseCase)
container.registerSingleton(AuditElysiaController)
