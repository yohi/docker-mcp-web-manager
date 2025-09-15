/**
 * 権限管理システム
 * ユーザーの権限とロールベースアクセス制御を提供
 */

export type Permission = string;

export const PERMISSIONS = {
  SERVER_VIEW: 'server.view',
  SERVER_CREATE: 'server.create',
  SERVER_EDIT: 'server.edit',
  SERVER_DELETE: 'server.delete',
  SERVER_START: 'server.start',
  SERVER_STOP: 'server.stop',
  CONFIGURATION_VIEW: 'configuration.view',
  CONFIGURATION_EDIT: 'configuration.edit',
  LOG_VIEW: 'log.view',
  ADMIN_USERS: 'admin.users',
  ADMIN_SYSTEM: 'admin.system',
  MONITORING_CONFIGURE: 'monitoring.configure',
} as const;

export interface UserPermissions {
  servers: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    start: boolean;
    stop: boolean;
  };
  configurations: {
    view: boolean;
    edit: boolean;
  };
  logs: {
    view: boolean;
  };
  admin: {
    users: boolean;
    system: boolean;
  };
}

export interface UserRole {
  id: string;
  name: string;
  permissions: UserPermissions;
}

export interface UserSession {
  id: string;
  email: string;
  role: string;
  permissions?: UserPermissions;
}

// デフォルト権限設定
export const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  admin: {
    servers: { view: true, create: true, edit: true, delete: true, start: true, stop: true },
    configurations: { view: true, edit: true },
    logs: { view: true },
    admin: { users: true, system: true },
  },
  user: {
    servers: { view: true, create: true, edit: true, delete: false, start: true, stop: true },
    configurations: { view: true, edit: true },
    logs: { view: true },
    admin: { users: false, system: false },
  },
  viewer: {
    servers: { view: true, create: false, edit: false, delete: false, start: false, stop: false },
    configurations: { view: true, edit: false },
    logs: { view: true },
    admin: { users: false, system: false },
  },
};

/**
 * ユーザーの権限を取得
 */
export function getUserPermissions(userRole: string): UserPermissions {
  return DEFAULT_PERMISSIONS[userRole] || DEFAULT_PERMISSIONS.viewer;
}

/**
 * 特定の権限を確認
 */
export function hasPermission(
  userPermissions: UserPermissions,
  resource: keyof UserPermissions,
  action: string
): boolean {
  const resourcePermissions = userPermissions[resource] as any;
  return resourcePermissions?.[action] === true;
}

/**
 * サーバー操作権限を確認
 */
export function canManageServers(userPermissions: UserPermissions): boolean {
  return userPermissions.servers.create || userPermissions.servers.edit || userPermissions.servers.delete;
}

/**
 * 管理者権限を確認
 */
export function isAdmin(userPermissions: UserPermissions): boolean {
  return userPermissions.admin.users || userPermissions.admin.system;
}

/**
 * セッションから権限を抽出
 */
export function getPermissionsFromSession(session: UserSession | null): UserPermissions {
  if (!session || !session.role) {
    return DEFAULT_PERMISSIONS.viewer;
  }
  
  return session.permissions || getUserPermissions(session.role);
}