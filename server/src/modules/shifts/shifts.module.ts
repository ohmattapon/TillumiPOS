import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { DrizzleRegisterRepository } from './adapters/repository/register.drizzle.repository'
import { DrizzleShiftRepository } from './adapters/repository/shift.drizzle.repository'
import { ShiftLedger } from './applications/services/shift-ledger'
import { DrizzleShiftSettingsGuard } from './adapters/repository/shift-settings-guard.drizzle.adapter'
import { RegisterElysiaController } from './adapters/controllers/register.controller'
import { ShiftElysiaController } from './adapters/controllers/shift.controller'
import { registerRepositoryToken } from './applications/ports/register.repository'
import { shiftRepositoryToken } from './applications/ports/shift.repository'
import { shiftSettingsGuardToken } from './applications/ports/shift-settings-guard.port'
import { shiftSummaryRepositoryToken } from './applications/ports/shift-summary.repository'
import { DrizzleShiftSummaryRepository } from './adapters/repository/shift-summary.drizzle.repository'
import { GetShiftSummaryUseCase } from './applications/usecases/get-shift-summary.usecase'
import { CreateRegisterUseCase, ListRegistersUseCase, UpdateRegisterUseCase } from './applications/usecases/register.usecases'
import { OpenShiftUseCase } from './applications/usecases/open-shift.usecase'
import {
  CancelShiftClosingUseCase,
  CloseShiftUseCase,
  GetCurrentShiftUseCase,
  GetShiftUseCase,
  ListShiftCashEntriesUseCase,
  ListShiftsUseCase,
  RecordCashMovementUseCase,
  StartShiftClosingUseCase,
} from './applications/usecases/shift-lifecycle.usecases'

container.register(registerRepositoryToken, { useClass: DrizzleRegisterRepository })
container.register(shiftRepositoryToken, { useClass: DrizzleShiftRepository })
container.register(TOKENS.ShiftLedger, { useClass: ShiftLedger })
container.register(shiftSettingsGuardToken, { useClass: DrizzleShiftSettingsGuard })
container.register(shiftSummaryRepositoryToken, { useClass: DrizzleShiftSummaryRepository })
container.registerSingleton(GetShiftSummaryUseCase)
container.registerSingleton(ListRegistersUseCase)
container.registerSingleton(CreateRegisterUseCase)
container.registerSingleton(UpdateRegisterUseCase)
container.registerSingleton(OpenShiftUseCase)
container.registerSingleton(GetCurrentShiftUseCase)
container.registerSingleton(GetShiftUseCase)
container.registerSingleton(ListShiftsUseCase)
container.registerSingleton(StartShiftClosingUseCase)
container.registerSingleton(CancelShiftClosingUseCase)
container.registerSingleton(CloseShiftUseCase)
container.registerSingleton(RecordCashMovementUseCase)
container.registerSingleton(ListShiftCashEntriesUseCase)
container.registerSingleton(RegisterElysiaController)
container.registerSingleton(ShiftElysiaController)
