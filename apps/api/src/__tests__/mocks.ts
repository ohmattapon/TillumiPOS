import { mock, type Mock } from 'bun:test'
import type { ICategoryRepository } from '../modules/categories/applications/ports/category.repository'
import type { IStockLedger } from '../modules/inventory/applications/ports/stock-ledger.port'
import type { IStockMovementRepository } from '../modules/inventory/applications/ports/stock-movement.repository'
import type { IProductRepository } from '../modules/products/applications/ports/product.repository'
import type { ISaleRepository } from '../modules/sales/applications/ports/sale.repository'
import type { IMediaStorage } from '../modules/shared/ports/media-storage.port'
import type { IPasswordHasher } from '../modules/shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../modules/shared/ports/unit-of-work.port'
import type { IUserRepository } from '../modules/users/applications/ports/user.repository'

/** A port whose every method is a bun mock with that method's signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches any method signature
type Mocked<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : T[K] }

export const mockCategoryRepository = (): Mocked<ICategoryRepository> => ({
  findAll: mock<ICategoryRepository['findAll']>(),
  findById: mock<ICategoryRepository['findById']>(),
  create: mock<ICategoryRepository['create']>(),
  update: mock<ICategoryRepository['update']>(),
})

export const mockUserRepository = (): Mocked<IUserRepository> => ({
  findAll: mock<IUserRepository['findAll']>(),
  findById: mock<IUserRepository['findById']>(),
  findByIdForUpdate: mock<IUserRepository['findByIdForUpdate']>(),
  findActiveById: mock<IUserRepository['findActiveById']>(),
  findCredentialsByUsername: mock<IUserRepository['findCredentialsByUsername']>(),
  create: mock<IUserRepository['create']>(),
  update: mock<IUserRepository['update']>(),
  countActiveOwners: mock<IUserRepository['countActiveOwners']>(),
})

/** Hashes are the plain text with a prefix, so tests can read what was stored. */
export const mockPasswordHasher = (): Mocked<IPasswordHasher> => ({
  hash: mock<IPasswordHasher['hash']>(async (plain) => `hashed:${plain}`),
  verify: mock<IPasswordHasher['verify']>(async (plain, hash) => hash === `hashed:${plain}`),
})

/** Runs the work immediately; transactional behaviour itself is covered by the integration test. */
export const mockUnitOfWork = () => {
  const run = mock((work: () => Promise<unknown>) => work())
  // `run` is generic in the port, which a mock cannot be; the cast keeps both the port type and the mock API.
  return { run } as unknown as IUnitOfWork & { run: typeof run }
}

export const mockProductRepository = (): Mocked<IProductRepository> => ({
  findAll: mock<IProductRepository['findAll']>(),
  findById: mock<IProductRepository['findById']>(),
  findManyForUpdate: mock<IProductRepository['findManyForUpdate']>(),
  create: mock<IProductRepository['create']>(),
  update: mock<IProductRepository['update']>(),
  adjustStock: mock<IProductRepository['adjustStock']>(),
  setImageKey: mock<IProductRepository['setImageKey']>(),
})

export const mockMediaStorage = (): Mocked<IMediaStorage> => ({
  urlFor: mock<IMediaStorage['urlFor']>((key) => 'https://media.test/' + key),
  put: mock<IMediaStorage['put']>(async () => {}),
  delete: mock<IMediaStorage['delete']>(async () => {}),
})

export const mockStockMovementRepository = (): Mocked<IStockMovementRepository> => ({
  create: mock<IStockMovementRepository['create']>(),
  findAll: mock<IStockMovementRepository['findAll']>(),
})

export const mockStockLedger = (): Mocked<IStockLedger> => ({
  record: mock<IStockLedger['record']>(),
})

export const mockSaleRepository = (): Mocked<ISaleRepository> => ({
  nextReceiptNo: mock<ISaleRepository['nextReceiptNo']>(),
  create: mock<ISaleRepository['create']>(),
  findById: mock<ISaleRepository['findById']>(),
  findByIdForUpdate: mock<ISaleRepository['findByIdForUpdate']>(),
  saveVoid: mock<ISaleRepository['saveVoid']>(async () => {}),
  findHeaders: mock<ISaleRepository['findHeaders']>(),
  sumCompleted: mock<ISaleRepository['sumCompleted']>(),
})
