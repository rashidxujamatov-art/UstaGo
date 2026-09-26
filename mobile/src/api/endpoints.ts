import { api } from './index';
import type {
  DeviceInfo,
  Invite,
  Language,
  LoginResult,
  Me,
  OtpTicket,
  PublicConfig,
  Role,
  SignedIn,
  ThemeModeApi,
} from './types';

/** Typed calls to /api/v1 (docs/02-arxitektura.md §6). */
export const endpoints = {
  config: () => api.get<PublicConfig>('/config', { auth: false }),

  invite: (code: string) =>
    api.get<Invite>(`/auth/invite/${encodeURIComponent(code)}`, { auth: false }),

  register: (input: {
    phone: string;
    email: string;
    password: string;
    referral_code?: string;
    lang: Language;
    device: DeviceInfo;
  }) =>
    api.post<{ otp: OtpTicket }>(
      '/auth/register',
      { ...input, accept_terms: true },
      { auth: false },
    ),

  verifyOtp: (input: {
    purpose: 'REGISTER' | 'LOGIN';
    phone: string;
    code: string;
    device: DeviceInfo;
  }) => api.post<SignedIn>('/auth/otp/verify', input, { auth: false }),

  resendOtp: (input: {
    purpose: 'REGISTER' | 'LOGIN' | 'PASSWORD_RESET';
    phone: string;
    lang: Language;
    device?: DeviceInfo;
  }) => api.post<{ otp: OtpTicket }>('/auth/otp/resend', input, { auth: false }),

  login: (input: { phone: string; password: string; lang: Language; device: DeviceInfo }) =>
    api.post<LoginResult>('/auth/login', input, { auth: false }),

  logout: () => api.post<void>('/auth/logout'),

  requestPasswordReset: (input: { phone: string; lang: Language }) =>
    api.post<{ otp: OtpTicket }>('/auth/password/reset', input, { auth: false }),

  confirmPasswordReset: (input: { phone: string; code: string; new_password: string }) =>
    api.post<void>('/auth/password/reset/confirm', input, { auth: false }),

  me: () => api.get<Me>('/me'),

  updatePreferences: (input: { lang?: Language; theme?: ThemeModeApi }) =>
    api.patch<Me>('/me', input),

  setRole: (role: Role) => api.post<Me>('/me/role', { role }),

  startIdentity: (input: {
    doc_type: 'ID_CARD' | 'PASSPORT';
    doc_number: string;
    birth_date: string;
    device_id: string;
  }) =>
    api.post<{ session_id: string; provider: 'mock' | 'myid' }>('/identity/myid/session', {
      ...input,
      consent: true,
    }),

  completeIdentity: (sessionId: string) =>
    api.post<Me>('/identity/myid/complete', { session_id: sessionId }),
};
