import { api } from './index';
import type {
  AcceptPreview,
  CancelReason,
  Category,
  ChatMessage,
  DeviceInfo,
  Invite,
  Language,
  LoginResult,
  Me,
  OtpTicket,
  NewOrderInput,
  Order,
  PaymentInfo,
  PlaceSuggestion,
  PublicConfig,
  ReferralSummary,
  SavedCard,
  Role,
  SignedIn,
  ThemeModeApi,
  Wallet,
  WalletTransactionsPage,
  WithdrawalInfo,
  WithdrawPreview,
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

  // ---------------------------------------------------------------- stage 2

  categories: () => api.get<Category[]>('/categories'),
  wallet: () => api.get<Wallet>('/wallet'),

  presignUpload: (purpose: 'ORDER_PHOTO' | 'FINISH_PHOTO' | 'CHAT_PHOTO', contentType: string) =>
    api.post<{ key: string; url: string; headers: Record<string, string>; max_bytes: number }>(
      '/uploads/presign',
      { purpose, content_type: contentType },
    ),

  reverseGeocode: (lat: number, lng: number, lang: Language) =>
    api.get<{ address: string | null }>(
      `/maps/reverse-geocode?${new URLSearchParams({ lat: String(lat), lng: String(lng), lang })}`,
    ),
  autocomplete: (
    q: string,
    session: string,
    lang: Language,
    near?: { lat: number; lng: number },
  ) => {
    const params = new URLSearchParams({ q, session, lang });
    if (near) {
      params.set('lat', String(near.lat));
      params.set('lng', String(near.lng));
    }
    return api.get<{ suggestions: PlaceSuggestion[] }>(`/maps/autocomplete?${params}`);
  },
  place: (placeId: string, session: string, lang: Language) =>
    api.get<{ lat: number; lng: number; address: string }>(
      `/maps/place/${encodeURIComponent(placeId)}?${new URLSearchParams({ session, lang })}`,
    ),

  createOrder: (input: NewOrderInput) => api.post<Order>('/orders', input),
  myOrders: (scope: 'all' | 'active' | 'finished') => api.get<Order[]>(`/orders?scope=${scope}`),
  order: (id: string) => api.get<Order>(`/orders/${id}`),
  cancelOrder: (id: string, reason?: CancelReason, note?: string) =>
    api.post<Order>(`/orders/${id}/cancel`, { reason, note }),

  feed: (query: { lat?: number; lng?: number; nearby?: boolean; payment?: 'cash' | 'online' }) => {
    const params = new URLSearchParams();
    if (query.lat !== undefined && query.lng !== undefined) {
      params.set('lat', String(query.lat));
      params.set('lng', String(query.lng));
    }
    if (query.nearby) params.set('nearby', 'true');
    if (query.payment) params.set('payment', query.payment);
    return api.get<Order[]>(`/feed?${params}`);
  },
  myJobs: (scope: 'active' | 'history') => api.get<Order[]>(`/me/jobs?scope=${scope}`),
  acceptPreview: (id: string) => api.get<AcceptPreview>(`/orders/${id}/accept-preview`),
  acceptOrder: (id: string) => api.post<Order>(`/orders/${id}/accept`),
  declineOrder: (id: string) => api.post<Order>(`/orders/${id}/decline`),
  orderStep: (id: string, step: 'depart' | 'arrive' | 'start') =>
    api.post<Order>(`/orders/${id}/${step}`),
  finishOrder: (id: string, photoKeys: string[]) =>
    api.post<Order>(`/orders/${id}/finish`, { photo_keys: photoKeys }),

  messages: (id: string) => api.get<ChatMessage[]>(`/orders/${id}/messages`),
  sendMessage: (id: string, input: { text?: string; photo_key?: string }) =>
    api.post<ChatMessage>(`/orders/${id}/messages`, input),
  markRead: (id: string) => api.post<void>(`/orders/${id}/messages/read`),

  // ---------------------------------------------------------------- stage 3

  walletTransactions: (before?: string) =>
    api.get<WalletTransactionsPage>(
      `/wallet/transactions${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  referrals: () => api.get<ReferralSummary>('/me/referrals'),
  /** BY9 "To'ladim". */
  customerPaid: (id: string) => api.post<Order>(`/orders/${id}/paid`),
  /** BJ13 "Pulni qabul qildim". */
  paymentReceived: (id: string) => api.post<Order>(`/orders/${id}/payment-received`),
  /** BJ13 "Pul kelmadi". */
  paymentNotReceived: (id: string, note?: string) =>
    api.post<Order>(`/orders/${id}/payment-not-received`, { note }),
  /** BY9 "Muammo bor". */
  dispute: (id: string, note?: string) => api.post<Order>(`/orders/${id}/dispute`, { note }),

  // ---------------------------------------------------------------- stage 4

  /** BY5: pays with the order's method (balance at once, card, Click / Payme link). */
  payOrder: (id: string, cardId?: string) =>
    api.post<{ payment: PaymentInfo | null; order: Order | null }>(`/orders/${id}/pay`, {
      card_id: cardId,
    }),
  /** BJ4: the executor's QR. */
  paymentSession: (id: string) => api.post<PaymentInfo>(`/orders/${id}/payment-session`),
  payment: (id: string) => api.get<PaymentInfo>(`/payments/${id}`),
  testCompletePayment: (id: string) => api.post<PaymentInfo>(`/payments/${id}/test-complete`),
  topup: (input: { amount: string; method: 'CLICK' | 'PAYME' | 'CARD'; card_id?: string }) =>
    api.post<PaymentInfo>('/wallet/topup', input),
  cards: () => api.get<SavedCard[]>('/wallet/cards'),
  addCard: (input: { number: string; expire: string }) =>
    api.post<{ card_id: string; phone_masked: string | null }>('/wallet/cards', input),
  verifyCard: (id: string, code: string) =>
    api.post<SavedCard>(`/wallet/cards/${id}/verify`, { code }),
  removeCard: (id: string) => api.delete<void>(`/wallet/cards/${id}`),
  withdrawPreview: (amount?: string) =>
    api.post<WithdrawPreview>('/wallet/withdraw/preview', { amount }),
  withdraw: (input: { amount: string; card_id: string; idempotency_key: string }) =>
    api.post<WithdrawalInfo>('/wallet/withdraw', input),
};
