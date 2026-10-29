import { container } from 'tsyringe'
import { printAuditToken } from '../receipt-printer/applications/ports/print-audit.port'
import { updateAuditToken } from '../update/applications/ports/update-audit.port'
import { AuditPrintAudit } from './adapters/repository/print-audit.adapter'
import { AuditUpdateAudit } from './adapters/repository/update-audit.adapter'
import { AuditElysiaController } from './adapters/controllers/audit.controller'
import { DrizzleAuditLogRepository } from './adapters/repository/audit-log.drizzle.repository'
import { auditLogToken } from './applications/ports/audit-log.port'
import { ListAuditLogsUseCase } from './applications/usecases/list-audit-logs.usecase'

container.register(auditLogToken, { useClass: DrizzleAuditLogRepository })
container.register(printAuditToken, { useClass: AuditPrintAudit })
container.register(updateAuditToken, { useClass: AuditUpdateAudit })
container.registerSingleton(ListAuditLogsUseCase)
container.registerSingleton(AuditElysiaController)
