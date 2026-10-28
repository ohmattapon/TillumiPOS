export interface PrintDispatch {
  /** Bytes the printer took; the printer speaks no replies on the raw port, so this is what was flushed. */
  sentBytes: number
}

/** The LAN thermal printer on the shop network. Everything that leaves the process for it goes through here. */
export interface IPrinterGateway {
  /**
   * Writes the bytes and closes the connection. Throws DomainExternalServiceError:
   * `PRINTER_UNREACHABLE` when nothing was sent, `PRINTER_TIMEOUT` with `params.outcome: 'unknown'`
   * when the connection stayed open past the timeout after bytes may have gone out.
   */
  sendRaw(request: { host: string; port: number; bytes: Uint8Array; timeoutMs: number }): Promise<PrintDispatch>
  /**
   * Opens the connection and closes it without sending anything. Throws DomainExternalServiceError
   * (`PRINTER_UNREACHABLE` / `PRINTER_TIMEOUT`) when the printer does not answer.
   */
  ping(request: { host: string; port: number; timeoutMs: number }): Promise<void>
}

const printerGatewayTokenSymbol: unique symbol = Symbol('IPrinterGateway')
export const printerGatewayToken = printerGatewayTokenSymbol.toString()
