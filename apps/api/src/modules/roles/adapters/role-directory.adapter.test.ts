import 'reflect-metadata'
import { expect, mock, test } from 'bun:test'
import { PERMISSIONS } from '../../../domains/permission.vo'
import { RoleEntity } from '../../../domains/role.domain'
import { RoleDirectoryAdapter } from './role-directory.adapter'
import { mockRoleRepository } from '../../../__tests__/mocks'

test('owners receive every permission and custom roles receive only their stored permissions', async () => {
  const repo = mockRoleRepository()
  repo.findById.mockResolvedValue(new RoleEntity({ id: 1, name: 'เจ้าของร้าน', systemKey: 'owner', permissions: [] }))
  const directory = new RoleDirectoryAdapter(repo)
  expect(await directory.permissionsOf(1)).toEqual(PERMISSIONS)
  repo.findById.mockResolvedValue(new RoleEntity({ id: 8, name: 'ผู้จัดการ', systemKey: null, permissions: ['reports.read'] }))
  expect(await directory.permissionsOf(8)).toEqual(['reports.read'])
  expect(await directory.findById(8)).toEqual({ id: 8, name: 'ผู้จัดการ', systemKey: null })
  repo.findById.mockResolvedValue(null)
  expect(await directory.permissionsOf(99)).toEqual([])
  expect(await directory.findById(99)).toBeNull()
})
test('role references can be locked for assignment', async () => {
  const repo = mockRoleRepository()
  repo.findByIdForUpdate.mockImplementation(mock(async () => new RoleEntity({ id: 8, name: 'ผู้จัดการ', systemKey: null, permissions: [] })))
  expect(await new RoleDirectoryAdapter(repo).findByIdForUpdate(8)).toEqual({ id: 8, name: 'ผู้จัดการ', systemKey: null })
  expect(repo.findByIdForUpdate).toHaveBeenCalledWith(8)
})
