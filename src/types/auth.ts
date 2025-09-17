/**
 * 認証関連の型定義
 */

export interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  role: UserRole;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

export type UserRole = 'admin' | 'user' | 'readonly';

export type Permission =
  | 'SERVERS_CREATE'
  | 'SERVERS_READ'
  | 'SERVERS_UPDATE'
  | 'SERVERS_DELETE'
  | 'SERVERS_START'
  | 'SERVERS_STOP'
  | 'CATALOG_READ'
  | 'CATALOG_INSTALL'
  | 'MONITORING_READ'
  | 'SETTINGS_READ'
  | 'SETTINGS_UPDATE'
  | 'USERS_READ'
  | 'USERS_MANAGE'
  | 'SYSTEM_ADMIN';

export interface AuthSession {
  user: User;
  expires: string;
  accessToken: string;
  refreshToken?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface PasskeyCredential {
  id: string;
  name: string;
  credentialId: string;
  userId: string;
  createdAt: string;
  lastUsedAt?: string;
  isActive: boolean;
}

export interface PasskeyRegistrationOptions {
  challenge: string;
  rp: RelyingParty;
  user: PasskeyUser;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptor[];
}

export interface PasskeyAuthenticationOptions {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptor[];
  userVerification?: 'required' | 'preferred' | 'discouraged';
}

export interface RelyingParty {
  id: string;
  name: string;
}

export interface PasskeyUser {
  id: string;
  name: string;
  displayName: string;
}

export interface PublicKeyCredentialParameters {
  type: 'public-key';
  alg: number;
}

export interface AuthenticatorSelectionCriteria {
  authenticatorAttachment?: 'platform' | 'cross-platform';
  requireResidentKey?: boolean;
  residentKey?: 'discouraged' | 'preferred' | 'required';
  userVerification?: 'required' | 'preferred' | 'discouraged';
}

export interface PublicKeyCredentialDescriptor {
  type: 'public-key';
  id: ArrayBuffer;
  transports?: ('usb' | 'nfc' | 'ble' | 'internal')[];
}

export interface AuthConfig {
  providers: {
    credentials: boolean;
    passkey: boolean;
    oauth: OAuthProvider[];
  };
  session: {
    strategy: 'jwt' | 'database';
    maxAge: number;
  };
  security: {
    requireMfa: boolean;
    allowPasskeyOnly: boolean;
    sessionTimeout: number;
  };
}

export interface OAuthProvider {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}