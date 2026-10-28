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
import { CreateRegisterUseCase } from './applications/usecases/create-register.usecase'
import { ListRegistersUseCase } from './applications/usecases/list-registers.usecase'
import { UpdateRegisterUseCase } from './applications/usecases/update-register.usecase'
import { OpenShiftUseCase } from './applications/usecases/open-shift.usecase'
import { CancelShiftClosingUseCase } from './applications/usecases/cancel-shift-closing.usecase'
import { CloseShiftUseCase } from './applications/usecases/close-shift.usecase'
import { GetCurrentShiftUseCase } from './applications/usecases/get-current-shift.usecase'
import { GetShiftUseCase } from './applications/usecases/get-shift.usecase'
import { ListShiftCashEntriesUseCase } from './applications/usecases/list-shift-cash-entries.usecase'
import { ListShiftsUseCase } from './applications/usecases/list-shifts.usecase'
import { RecordCashMovementUseCase } from './applications/usecases/record-cash-movement.usecase'
import { StartShiftClosingUseCase } from './applications/usecases/start-shift-closing.usecase'

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
