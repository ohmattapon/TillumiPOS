import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { DrizzleRegisterRepository } from './adapters/repository/register.drizzle.repository'
import { DrizzleShiftRepository } from './adapters/repository/shift.drizzle.repository'
import { DrizzleShiftLedgerAdapter } from './adapters/repository/shift-ledger.drizzle.adapter'
import { DrizzleShiftSettingsGuard } from './adapters/repository/shift-settings-guard.drizzle.adapter'
import { RegisterElysiaController } from './adapters/controllers/register.controller'
import { ShiftElysiaController } from './adapters/controllers/shift.controller'
import { registerRepositoryToken } from './applications/ports/register.repository'
import { shiftRepositoryToken } from './applications/ports/shift.repository'
import { shiftSettingsGuardToken } from './applications/ports/shift-settings-guard.port'
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
container.register(TOKENS.ShiftLedger, { useClass: DrizzleShiftLedgerAdapter })
container.register(shiftSettingsGuardToken, { useClass: DrizzleShiftSettingsGuard })
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
