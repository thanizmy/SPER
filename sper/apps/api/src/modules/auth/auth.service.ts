import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
import { db, type DB } from '../../config/db';
import { AuthRepo, authRepo } from './auth.repo';
import {
  issueTokens,
  verifyRefresh,
  signMagicLink,
  verifyMagicLink,
  signPasswordReset,
  verifyPasswordReset,
} from './tokens';
import { ConflictError, UnauthorizedError, ValidationError } from '../../shared/errors';
import type { UserRow } from '../../db/schema';
import type { AuthResponse, AuthTokens, CheckInFrequency, UserDTO } from '@sper/shared-types';

function toUserDTO(row: UserRow): UserDTO {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timezone: row.timezone,
    avatar_url: row.avatarUrl ?? null,
    notifications_paused: row.notificationsPaused,
    checkin_frequency: row.checkinFrequency as CheckInFrequency,
    last_checkin_at: row.lastCheckinAt ? row.lastCheckinAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepo = authRepo,
    private readonly database: DB = db,
  ) {}

  async register(input: {
    name: string;
    email: string;
    password: string;
    timezone: string;
  }): Promise<AuthResponse> {
    if (input.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    const existing = await this.repo.findByEmail(this.database, input.email);
    if (existing) throw new ConflictError('An account with that email already exists');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.repo.createUser(this.database, {
      name: input.name,
      email: input.email,
      passwordHash,
      timezone: input.timezone,
    });
    return { user: toUserDTO(user), tokens: issueTokens(user.id) };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.repo.findByEmail(this.database, email);
    // Uniform failure to avoid leaking which emails exist.
    if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    return { user: toUserDTO(user), tokens: issueTokens(user.id) };
  }

  /**
   * Issue a magic link. We never reveal whether the email is registered; the
   * caller (controller) responds 202 regardless. Returns the token so the
   * delivery layer can email it (out of scope here — logged in dev).
   */
  async issueMagicLink(email: string): Promise<{ token: string | null }> {
    const user = await this.repo.findByEmail(this.database, email);
    if (!user) return { token: null };
    return { token: signMagicLink(user.id) };
  }

  async verifyMagicLink(token: string): Promise<AuthResponse> {
    let claims;
    try {
      claims = verifyMagicLink(token);
    } catch {
      throw new UnauthorizedError('Magic link is invalid or expired');
    }
    const user = await this.repo.findById(this.database, claims.sub);
    if (!user) throw new UnauthorizedError('Account no longer exists');
    return { user: toUserDTO(user), tokens: issueTokens(user.id) };
  }

  /**
   * Issue a password-reset token. Same "never reveal whether the email
   * exists" contract as the magic link — the route always responds 202.
   */
  async requestPasswordReset(email: string): Promise<{ token: string | null }> {
    const user = await this.repo.findByEmail(this.database, email);
    if (!user) return { token: null };
    return { token: signPasswordReset(user.id) };
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<AuthResponse> {
    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    let claims;
    try {
      claims = verifyPasswordReset(token);
    } catch {
      throw new UnauthorizedError('Reset code is invalid or expired');
    }
    const user = await this.repo.findById(this.database, claims.sub);
    if (!user) throw new UnauthorizedError('Account no longer exists');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.repo.updatePasswordHash(this.database, user.id, passwordHash);
    return { user: toUserDTO(updated), tokens: issueTokens(updated.id) };
  }

  /** Refresh rotation: a valid refresh token yields a fresh token pair. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    let claims;
    try {
      claims = verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedError('Refresh token is invalid or expired');
    }
    const user = await this.repo.findById(this.database, claims.sub);
    if (!user) throw new UnauthorizedError('Account no longer exists');
    return issueTokens(user.id);
  }
}

export const authService = new AuthService();
export { toUserDTO };
