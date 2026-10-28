export interface PrinterSettings {
  /** LAN address of the thermal printer; null means it is not set up. */
  host: string | null
  /** TCP port the printer listens on; 9100 is the ESC/POS default. */
  port: number
  /** Print through the LAN printer instead of the browser. */
  enabled: boolean
  /** Kick the drawer through the printer after printing. */
  drawerEnabled: boolean
}

/** The shop's printer setup. Owned here, answered by the settings module from its own row. */
export interface IPrinterSettings {
  current(): Promise<PrinterSettings>
}

const printerSettingsTokenSymbol: unique symbol = Symbol('IPrinterSettings')
export const printerSettingsToken = printerSettingsTokenSymbol.toString()
