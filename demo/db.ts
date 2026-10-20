// Tiny in-memory store behind the static showcase worker. Task 1 holds the
// shape only; Task 2 fills real fixtures that match the Eden response types.

export interface DemoSession {
  signedIn: boolean
}

export interface DemoShopSettings {
  shopName: string
}

export interface DemoProduct {
  id: string
  name: string
  priceSatang: number
}

export interface DemoSale {
  id: string
  totalSatang: number
}

export interface DemoDb {
  session: DemoSession
  settings: DemoShopSettings
  products: DemoProduct[]
  salesToday: DemoSale[]
  reset(): void
}

const initialSettings: DemoShopSettings = { shopName: 'ร้านตัวอย่าง' }

export const demoDb: DemoDb = {
  session: { signedIn: false },
  settings: { ...initialSettings },
  products: [],
  salesToday: [],
  reset(): void {
    this.session.signedIn = false
    this.settings = { ...initialSettings }
    this.products = []
    this.salesToday = []
  },
}
