export interface PrinterInfo {
  name: string
  isDefault: boolean
}

/** The saved printer while it is installed, else the system default, else the first one, else none. */
export function choosePrinter(saved: string | null, available: PrinterInfo[]): string | null {
  if (saved && available.some((printer) => printer.name === saved)) return saved
  return (available.find((printer) => printer.isDefault) ?? available[0])?.name ?? null
}
