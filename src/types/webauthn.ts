// =============================================================================
// WebAuthn / Passkey Types
// パスキー認証に関する型定義
// =============================================================================

import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';

// =============================================================================
// User Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  username: string;
  role?: 'admin' | 'user' | 'viewer';
  permissions?: string[];
}

// =============================================================================
// Passkey Types
// =============================================================================

export interface Passkey {
  id: string;
  userId: string;
  credentialId: string;
  credentialPublicKey: Uint8Array;
  counter: number;
  credentialDeviceType: 'singleDevice' | 'multiDevice';
  credentialBackedUp: boolean;
  transports?: AuthenticatorTransport[];
  aaguid?: string;
  name?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePasskeyRequest {
  userId: string;
  name?: string;
}

// =============================================================================
// WebAuthn Challenge Types
// =============================================================================

export interface WebAuthnChallenge {
  id: string;
  challenge: string;
  userId?: string;
  type: 'registration' | 'authentication';
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
}

// =============================================================================
// Registration Flow Types
// =============================================================================

export interface RegistrationOptions {
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge: string;
}

export interface RegistrationRequest {
  userId: string;
  credential: RegistrationResponseJSON;
  challengeId: string;
  name?: string;
}

export interface RegistrationResult {
  success: boolean;
  passkey?: Passkey;
  error?: string;
}

// =============================================================================
// Authentication Flow Types
// =============================================================================

export interface AuthenticationOptions {
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
}

export interface AuthenticationRequest {
  credential: AuthenticationResponseJSON;
  challengeId: string;
  userHandle?: string;
}

export interface AuthenticationResult {
  success: boolean;
  user?: User;
  passkey?: Passkey;
  error?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface PasskeyListResponse {
  passkeys: Array<{
    id: string;
    name?: string;
    credentialId: string;
    transports?: AuthenticatorTransport[];
    lastUsedAt?: Date;
    createdAt: Date;
  }>;
}

export interface WebAuthnConfigResponse {
  rpName: string;
  rpId: string;
  origin: string;
  allowedCredentials?: boolean;
  userVerification: UserVerificationRequirement;
  timeout: number;
}

// =============================================================================
// Error Types
// =============================================================================

export interface WebAuthnError {
  code: string;
  message: string;
  details?: any;
}

export const WEBAUTHN_ERROR_CODES = {
  INVALID_CHALLENGE: 'INVALID_CHALLENGE',
  EXPIRED_CHALLENGE: 'EXPIRED_CHALLENGE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PASSKEY_NOT_FOUND: 'PASSKEY_NOT_FOUND',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  UNSUPPORTED_BROWSER: 'UNSUPPORTED_BROWSER',
  USER_CANCELLED: 'USER_CANCELLED',
  TIMEOUT: 'TIMEOUT',
  DUPLICATE_CREDENTIAL: 'DUPLICATE_CREDENTIAL',
} as const;

// =============================================================================
// Configuration Types
// =============================================================================

export interface WebAuthnConfig {
  rpName: string;
  rpId: string;
  origin: string;
  allowedOrigins: string[];
  challengeTimeout: number; // milliseconds
  userVerification: UserVerificationRequirement;
  authenticatorAttachment?: AuthenticatorAttachment;
  requireResidentKey: boolean;
  residentKey: ResidentKeyRequirement;
}

// =============================================================================
// Utility Types
// =============================================================================

export type PasskeyTransport = 'ble' | 'hybrid' | 'internal' | 'nfc' | 'usb';

export interface PasskeySupport {
  supported: boolean;
  platformAuthenticator: boolean;
  crossPlatformAuthenticator: boolean;
  conditionalMediation: boolean;
  userAgent: string;
}

export interface PasskeyRegistrationFlow {
  step: 'start' | 'options' | 'registration' | 'verification' | 'complete';
  userId?: string;
  challengeId?: string;
  options?: PublicKeyCredentialCreationOptionsJSON;
  error?: string;
}

export interface PasskeyAuthenticationFlow {
  step: 'start' | 'options' | 'authentication' | 'verification' | 'complete';
  challengeId?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
  user?: User;
  error?: string;
}