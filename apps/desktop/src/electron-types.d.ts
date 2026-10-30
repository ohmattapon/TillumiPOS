// A stand-in for the real "electron" typings, which are not installed yet. It declares only the
// members this app calls, each named after the Electron API it mirrors. Delete this file once the
// `electron` package is installed: its own typings then replace it (and check these shapes).
declare module 'electron' {
  interface Event {
    preventDefault(): void
  }

  /** Details of `will-navigate` and `will-redirect`. */
  interface NavigationEvent extends Event {
    readonly url: string
    readonly isMainFrame: boolean
  }

  interface Input {
    readonly type: string
    // the physical key ("KeyO"), which does not change with the keyboard layout
    readonly code: string
    readonly control: boolean
    readonly shift: boolean
    readonly alt: boolean
    readonly meta: boolean
  }

  interface PrinterInfo {
    readonly name: string
    readonly displayName: string
    readonly isDefault: boolean
  }

  interface WebContentsPrintOptions {
    silent?: boolean
    deviceName?: string
    printBackground?: boolean
  }

  interface WebFrameMain {
    readonly url: string
    readonly parent: WebFrameMain | null
  }

  interface IpcMainInvokeEvent {
    // null when the frame was destroyed before the message arrived
    readonly senderFrame: WebFrameMain | null
  }

  interface WebContents {
    loadURL(url: string): Promise<void>
    getPrintersAsync(): Promise<PrinterInfo[]>
    print(options: WebContentsPrintOptions, callback: (success: boolean, failureReason: string) => void): void
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
    on(event: 'will-navigate' | 'will-redirect', listener: (details: NavigationEvent) => void): this
    on(event: 'before-input-event', listener: (event: Event, input: Input) => void): this
    on(
      event: 'did-fail-load',
      listener: (
        event: Event,
        errorCode: number,
        errorDescription: string,
        validatedURL: string,
        isMainFrame: boolean,
      ) => void,
    ): this
  }

  interface WebPreferences {
    contextIsolation?: boolean
    nodeIntegration?: boolean
    sandbox?: boolean
    webSecurity?: boolean
    devTools?: boolean
    javascript?: boolean
    preload?: string
  }

  interface BrowserWindowConstructorOptions {
    show?: boolean
    fullscreen?: boolean
    kiosk?: boolean
    autoHideMenuBar?: boolean
    backgroundColor?: string
    title?: string
    webPreferences?: WebPreferences
  }

  class BrowserWindow {
    constructor(options: BrowserWindowConstructorOptions)
    readonly webContents: WebContents
    loadURL(url: string): Promise<void>
    loadFile(filePath: string): Promise<void>
    isDestroyed(): boolean
    isMinimized(): boolean
    restore(): void
    show(): void
    focus(): void
    close(): void
    destroy(): void
    removeMenu(): void
    isFullScreen(): boolean
    setFullScreen(flag: boolean): void
    isKiosk(): boolean
    setKiosk(flag: boolean): void
    on(event: 'close', listener: (event: Event) => void): this
    on(event: 'session-end', listener: () => void): this
  }

  interface MenuItemConstructorOptions {
    label?: string
    type?: 'normal' | 'separator' | 'radio'
    checked?: boolean
    enabled?: boolean
    click?: () => void
    submenu?: MenuItemConstructorOptions[]
  }

  class Menu {
    static buildFromTemplate(template: MenuItemConstructorOptions[]): Menu
    static setApplicationMenu(menu: Menu | null): void
    popup(options: { window: BrowserWindow }): void
  }

  const app: {
    requestSingleInstanceLock(): boolean
    getPath(name: 'userData'): string
    whenReady(): Promise<void>
    quit(): void
    on(event: 'second-instance' | 'window-all-closed' | 'before-quit', listener: () => void): void
  }

  const shell: {
    openExternal(url: string): Promise<void>
  }

  const dialog: {
    showErrorBox(title: string, content: string): void
  }

  const ipcMain: {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void
  }

  const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
  }

  const contextBridge: {
    exposeInMainWorld(apiKey: string, api: object): void
  }
}
