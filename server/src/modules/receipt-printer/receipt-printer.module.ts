import { container } from 'tsyringe'
import { ReceiptPrinterElysiaController } from './adapters/controllers/receipt-printer.controller'
import { TcpPrinterGateway } from './adapters/gateway/tcp-printer.gateway'
import { printerGatewayToken } from './applications/ports/printer-gateway.port'
import { OpenDrawerUseCase } from './applications/usecases/open-drawer.usecase'
import { PrintReceiptUseCase } from './applications/usecases/print-receipt.usecase'
import { TestPrinterConnectionUseCase } from './applications/usecases/test-connection.usecase'

container.register(printerGatewayToken, { useClass: TcpPrinterGateway })
container.registerSingleton(PrintReceiptUseCase)
container.registerSingleton(OpenDrawerUseCase)
container.registerSingleton(TestPrinterConnectionUseCase)
container.registerSingleton(ReceiptPrinterElysiaController)
