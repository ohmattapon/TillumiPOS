import type { Permission } from '../../../../domains/permission.vo'
export interface IRolePermissionReader { permissionsOf(roleId: number): Promise<readonly Permission[]> }
export const rolePermissionReaderToken = Symbol('IRolePermissionReader').toString()
