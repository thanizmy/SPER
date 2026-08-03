import * as SecureStorage from '../lib/secureStorage';
import type {
  AuthResponse,
  AuthTokens,
  RegisterRequest,
  LoginRequest,
  CircleDTO,
  CircleMemberDTO,
  InviteResponse,
  MyCircleDTO,
  SubmitCheckInRequest,
  SubmitCheckInResponse,
  SperEntryDTO,
  CareCardDTO,
  TouchpointDTO,
  LogTouchpointRequest,
  RegisterDeviceRequest,
  UpdateProfileRequest,
  UserDTO,
} from '@sper/shared-types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const ACCESS_KEY = 'sper.access';
const REFRESH_KEY = 'sper.refresh';

async function setTokens(t: AuthTokens): Promise<void> {
  await SecureStorage.setItem(ACCESS_KEY, t.access_token);
  await SecureStorage.setItem(REFRESH_KEY, t.refresh_token);
}
export async function clearTokens(): Promise<void> {
  await SecureStorage.deleteItem(ACCESS_KEY);
  await SecureStorage.deleteItem(REFRESH_KEY);
}
async function getAccess(): Promise<string | null> {
  return SecureStorage.getItem(ACCESS_KEY);
}
async function getRefresh(): Promise<string | null> {
  return SecureStorage.getItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function raw<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; retryOn401?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true, retryOn401 = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getAccess();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && auth && retryOn401) {
    const refreshed = await tryRefresh();
    if (refreshed) return raw<T>(path, { ...opts, retryOn401: false });
  }

  if (!res.ok) {
    let code = 'ERROR';
    let message = res.statusText;
    try {
      const j = await res.json();
      code = j?.error?.code ?? code;
      message = j?.error?.message ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204 || res.status === 202) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  const refresh_token = await getRefresh();
  if (!refresh_token) return false;
  try {
    const { tokens } = await raw<{ tokens: AuthTokens }>('/auth/refresh', {
      method: 'POST',
      body: { refresh_token },
      auth: false,
    });
    await setTokens(tokens);
    return true;
  } catch {
    await clearTokens();
    return false;
  }
}

export const api = {
  async register(input: RegisterRequest): Promise<AuthResponse> {
    const r = await raw<AuthResponse>('/auth/register', { method: 'POST', body: input, auth: false });
    await setTokens(r.tokens);
    return r;
  },
  async login(input: LoginRequest): Promise<AuthResponse> {
    const r = await raw<AuthResponse>('/auth/login', { method: 'POST', body: input, auth: false });
    await setTokens(r.tokens);
    return r;
  },
  async requestMagicLink(email: string): Promise<void> {
    await raw<void>('/auth/magic-link', { method: 'POST', body: { email }, auth: false });
  },
  async verifyMagicLink(token: string): Promise<AuthResponse> {
    const r = await raw<AuthResponse>('/auth/magic-link/verify', {
      method: 'POST',
      body: { token },
      auth: false,
    });
    await setTokens(r.tokens);
    return r;
  },
  async requestPasswordReset(email: string): Promise<void> {
    await raw<void>('/auth/reset-password/request', { method: 'POST', body: { email }, auth: false });
  },
  async confirmPasswordReset(token: string, password: string): Promise<AuthResponse> {
    const r = await raw<AuthResponse>('/auth/reset-password/confirm', {
      method: 'POST',
      body: { token, password },
      auth: false,
    });
    await setTokens(r.tokens);
    return r;
  },
  async isSignedIn(): Promise<boolean> {
    return (await getAccess()) !== null;
  },
  signOut: clearTokens,

  // Profile
  me: () => raw<{ user: UserDTO }>('/users/me').then((r) => r.user),
  updateProfile: (body: UpdateProfileRequest) =>
    raw<{ user: UserDTO }>('/users/me', { method: 'PATCH', body }).then((r) => r.user),

  // Circles
  myCircles: () => raw<{ circles: MyCircleDTO[] }>('/circles/mine').then((r) => r.circles),
  createCircle: (name: string) =>
    raw<{ circle: CircleDTO }>('/circles', { method: 'POST', body: { name } }).then((r) => r.circle),
  joinCircle: (args: { code?: string; invite_token?: string }) =>
    raw<{ circle: CircleDTO }>('/circles/join', { method: 'POST', body: args }).then((r) => r.circle),
  createInvite: (circleId: string, email?: string) =>
    raw<InviteResponse>(`/circles/${circleId}/invites`, {
      method: 'POST',
      body: email ? { email } : {},
    }),
  agreePact: (circleId: string) =>
    raw<{ ok: boolean }>(`/circles/${circleId}/pact/agree`, { method: 'POST' }),
  members: (circleId: string) =>
    raw<{ members: CircleMemberDTO[] }>(`/circles/${circleId}/members`).then((r) => r.members),
  leaveCircle: (circleId: string) =>
    raw<{ ok: boolean }>(`/circles/${circleId}/leave`, { method: 'POST' }),

  // Check-ins
  submitCheckIn: (input: SubmitCheckInRequest) =>
    raw<SubmitCheckInResponse>('/checkins', { method: 'POST', body: input }),
  sper: (circleId: string) =>
    raw<{ sper: SperEntryDTO[] }>(`/circles/${circleId}/sper`).then((r) => r.sper),
  careCards: (circleId: string) =>
    raw<{ care_cards: CareCardDTO[] }>(`/circles/${circleId}/care-cards`).then((r) => r.care_cards),

  // Touchpoints
  logTouchpoint: (checkinId: string, body: LogTouchpointRequest) =>
    raw<{ touchpoint: TouchpointDTO }>(`/checkins/${checkinId}/touchpoints`, {
      method: 'POST',
      body,
    }).then((r) => r.touchpoint),
  touchpoints: (checkinId: string) =>
    raw<{ touchpoints: TouchpointDTO[] }>(`/checkins/${checkinId}/touchpoints`).then(
      (r) => r.touchpoints,
    ),
  sendGratitude: (checkinId: string) =>
    raw<{ thanked: number }>(`/checkins/${checkinId}/gratitude`, { method: 'POST' }),

  // Devices
  registerDevice: (body: RegisterDeviceRequest) =>
    raw<{ device: { id: string; platform: string } }>('/devices', { method: 'POST', body }),
};

export default api;
