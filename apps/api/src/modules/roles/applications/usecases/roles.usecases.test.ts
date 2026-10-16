import 'reflect-metadata'
import { describe, expect, mock, test } from 'bun:test'
import { RoleEntity } from '../../../../domains/role.domain'
import { mockUnitOfWork } from '../../../../__tests__/mocks'
import { CreateRoleUseCase } from './create-role.usecase'
import { UpdateRoleUseCase } from './update-role.usecase'
import { DeleteRoleUseCase } from './delete-role.usecase'
import { ListRolesUseCase } from './list-roles.usecase'
import { GetRoleUseCase } from './get-role.usecase'
import type { IRoleRepository } from '../ports/role.repository'

const role = () => new RoleEntity({ id: 8, name: 'ผู้จัดการ', systemKey: null, permissions: ['sales.void'] })
const repository = () => ({
  findAll: mock<IRoleRepository['findAll']>(), findById: mock<IRoleRepository['findById']>(),
  findByIdForUpdate: mock<IRoleRepository['findByIdForUpdate']>(), create: mock<IRoleRepository['create']>(),
  update: mock<IRoleRepository['update']>(), delete: mock<IRoleRepository['delete']>(),
})
const usage = () => ({ countUsers: mock(async (_id: number) => 0) })

describe('role commands', () => {
  test('creates a custom role with unique sorted permissions inside a unit of work', async () => {
    const repo = repository(), uow = mockUnitOfWork()
    repo.create.mockImplementation(async (entity) => new RoleEntity({ ...entity.toSnapshot(), id: 8 }))
    const result = await new CreateRoleUseCase(repo, uow).execute({ name: 'ผู้จัดการ', permissions: ['sales.void', 'sales.void', 'reports.read'] })
    expect(result.permissions).toEqual(['reports.read', 'sales.void'])
    expect(result.systemKey).toBeNull()
    expect(uow.run).toHaveBeenCalledTimes(1)
  })
  test.each([
    { name: 'x', permissions: ['sales.fly'] }, { name: ' ', permissions: [] },
    { name: 'x'.repeat(61), permissions: [] },
  ])('rejects an invalid role before storing it: %p', async (input) => {
    const repo = repository()
    await expect(new CreateRoleUseCase(repo, mockUnitOfWork()).execute(input)).rejects.toThrow()
    expect(repo.create).not.toHaveBeenCalled()
  })
  test('replaces all permissions after locking the role', async () => {
    const repo = repository()
    repo.findByIdForUpdate.mockResolvedValue(role())
    repo.update.mockImplementation(async (entity) => entity)
    const result = await new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(8, { permissions: ['reports.read'] })
    expect(result.permissions).toEqual(['reports.read'])
    expect(repo.findByIdForUpdate).toHaveBeenCalledWith(8)
  })
  test('protects the owner and reports missing roles', async () => {
    const repo = repository()
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 1, name: 'เจ้าของร้าน', systemKey: 'owner', permissions: [] }))
    await expect(new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(1, { permissions: [] })).rejects.toMatchObject({ code: 'ROLE_PROTECTED' })
    repo.findByIdForUpdate.mockResolvedValue(null)
    await expect(new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(99, { name: 'x' })).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(repo.update).not.toHaveBeenCalled()
  })
  test('allows editing cashier permissions but protects its name', async () => {
    const repo = repository()
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 2, name: 'แคชเชียร์', systemKey: 'cashier', permissions: [] }))
    repo.update.mockImplementation(async (entity) => entity)
    expect((await new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(2, { permissions: ['reports.read'] })).permissions).toEqual(['reports.read'])
    await expect(new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(2, { name: 'อื่น' })).rejects.toMatchObject({ code: 'ROLE_PROTECTED' })
  })
  test('deletes an unused custom role', async () => {
    const repo = repository(), users = usage()
    repo.findByIdForUpdate.mockResolvedValue(role())
    const result = await new DeleteRoleUseCase(repo, mockUnitOfWork(), users).execute(8)
    expect(result.id).toBe(8)
    expect(repo.delete).toHaveBeenCalledWith(8)
  })
  test('refuses a used, system or missing role without deleting', async () => {
    const repo = repository(), users = usage(), command = new DeleteRoleUseCase(repo, mockUnitOfWork(), users)
    repo.findByIdForUpdate.mockResolvedValue(role()); users.countUsers.mockResolvedValue(2)
    await expect(command.execute(8)).rejects.toMatchObject({ code: 'ROLE_IN_USE' })
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 2, name: 'แคชเชียร์', systemKey: 'cashier', permissions: [] }))
    await expect(command.execute(2)).rejects.toMatchObject({ code: 'ROLE_PROTECTED' })
    expect(users.countUsers).toHaveBeenCalledTimes(1)
    repo.findByIdForUpdate.mockResolvedValue(null)
    await expect(command.execute(99)).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(repo.delete).not.toHaveBeenCalled()
  })
})

describe('role queries', () => {
  test.each(['roles.manage', 'users.manage'] as const)('allows %s to list with pagination and user counts', async (permission) => {
    const repo = repository(), users = usage()
    repo.findAll.mockResolvedValue({ items: [role()], total: 3 }); users.countUsers.mockResolvedValue(2)
    const result = await new ListRolesUseCase(repo, users).execute({ limit: 1, offset: 2 }, { role: 'cashier', permissions: [permission] })
    expect(repo.findAll).toHaveBeenCalledWith({ limit: 1, offset: 2 })
    expect(result).toMatchObject({ items: [{ id: 8, userCount: 2 }], total: 3 })
  })
  test('denies a cashier without management permissions', async () => {
    const repo = repository()
    await expect(new ListRolesUseCase(repo, usage()).execute({}, { role: 'cashier' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repo.findAll).not.toHaveBeenCalled()
  })
  test('rejects invalid pagination and returns a role read model', async () => {
    const repo = repository(), users = usage()
    await expect(new ListRolesUseCase(repo, users).execute({ limit: 0 }, { role: 'owner' })).rejects.toThrow()
    repo.findById.mockResolvedValue(role())
    expect(await new GetRoleUseCase(repo, users).execute(8)).toMatchObject({ id: 8, userCount: 0 })
    repo.findById.mockResolvedValue(null)
    await expect(new GetRoleUseCase(repo, users).execute(99)).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
  })
})
