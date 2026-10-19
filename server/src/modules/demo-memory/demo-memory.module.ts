import { container } from 'tsyringe'
import { auditLogToken } from '../audit/applications/ports/audit-log.port'
import { commandReceiptsToken } from '../shared/ports/command-receipts.port'
import { TOKENS } from '../tokens'
import { MemoryAuditLog } from './memory/audit-log.memory'
import { MemoryCommandReceipts } from './memory/command-receipts.memory'
import { MemoryUnitOfWork } from './memory/unit-of-work.memory'

// Demo composition root (DEMO_MODE=memory), imported after the drizzle
// modules, so these memory bindings replace the database-backed ones.
// Later demo tasks register the remaining memory twins in this same file.
container.register(TOKENS.UnitOfWork, { useClass: MemoryUnitOfWork })
container.register(commandReceiptsToken, { useClass: MemoryCommandReceipts })
container.register(auditLogToken, { useClass: MemoryAuditLog })
