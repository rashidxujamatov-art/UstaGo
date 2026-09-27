import { api } from './index';
import type {
  AcceptPreview,
  AdminCategory,
  AdminDashboard,
  AdminOrderDetail,
  AdminOrderListFilter,
  AdminOrderListPage,
  AdminPermission,
  AdminPermissionRequestItem,
  AdminUserDetail,
  AdminUserListFilter,
  AdminUserListPage,
  BroadcastCreateResult,
  BroadcastDetail,
  BroadcastListPage,
  CancelReason,
  Category,
  CategoryUpdateInput,
  ChatMessage,
  DeviceInfo,
  DisputeDecisionValue,
  DisputeDetail,
  DisputeListFilter,
  DisputeListPage,
  DisputeTrack,
  FinanceOrdersPage,
  FinancePeriod,
  FinanceSummary,
  Invite,
  Language,
  LoginResult,
  MapsOverview,
  MapsSettings,
  Me,
  NewBroadcastInput,
  NewCategoryInput,
  OtpTicket,
  NewOrderInput,
  Order,
  PaymentInfo,
  PermissionRequest,
  PermissionRequestStatus,
  PlaceSuggestion,
  PublicConfig,
  ReferralSummary,
  SaSettings,
  SaSettingsUpdate,
  SavedCard,
  Role,
  SignedIn,
  StaffMember,
  TaxMethod,
  TaxMethodsOverview,
  TaxStatus,
  TaxVerification,
  ThemeModeApi,
  TripPointInput,
  TripPointsResult,
  TripView,
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

  presignUpload: (
    purpose: 'ORDER_PHOTO' | 'FINISH_PHOTO' | 'CHAT_PHOTO' | 'TAX_CERTIFICATE',
    contentType: string,
  ) =>
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
  /** `depart` optionally shares live location (BJ11): `{ share_location }`. */
  orderStep: (
    id: string,
    step: 'depart' | 'arrive' | 'start',
    body?: { share_location?: boolean },
  ) => api.post<Order>(`/orders/${id}/${step}`, body),
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
  /** BY9 "To'ladim": cash, or the pro's Xolis QR when they use Paynet Xolis (stage 5). */
  customerPaid: (id: string, via?: 'CASH' | 'XOLIS_QR') =>
    api.post<Order>(`/orders/${id}/paid`, via ? { via } : undefined),
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

  // ---------------------------------------------------------------- stage 5

  /** BJ8-BJ9: the executor's tax method status. */
  taxStatus: () => api.get<TaxStatus>('/tax/status'),
  /** BJ8/BJ9: first tries the state tax system by PINFL; a certificate goes to AD1. */
  taxSelfEmployed: (certificateKey?: string) =>
    api.post<TaxStatus>(
      '/tax/self-employed',
      certificateKey ? { certificate_key: certificateKey } : undefined,
    ),
  /** BJ10: the executor's Xolis QR and the phone registered in Xolis. */
  taxConnectXolis: (input: { qr: string; phone: string }) =>
    api.post<TaxStatus>('/tax/xolis', input),
  /** BJ9 "Muddat tugashidan 7 kun oldin eslatish". */
  taxSetReminders: (enabled: boolean) => api.put<TaxStatus>('/tax/reminders', { enabled }),

  /** AD1 "Hujjat murojaatlari" (users.manage). */
  adminVerifications: () => api.get<TaxVerification[]>('/admin/verifications'),
  adminVerification: (id: string) => api.get<TaxVerification>(`/admin/verifications/${id}`),
  adminVerificationDecide: (
    id: string,
    decision:
      { decision: 'APPROVE'; valid_until?: string } | { decision: 'REJECT'; reason: string },
  ) => api.post<TaxVerification>(`/admin/verifications/${id}/decide`, decision),

  /** SA5 "Soliq usullari" (super admin only). */
  taxMethodsOverview: () => api.get<TaxMethodsOverview>('/sa/tax-methods'),
  setTaxMethodsEnabled: (enabled: TaxMethod[]) =>
    api.put<TaxMethodsOverview>('/sa/tax-methods', { enabled }),
  remindTaxMethods: () => api.post<{ sent: number }>('/sa/tax-methods/remind'),

  // ---------------------------------------------------------------- stage 6

  /** Both parties of the order; anyone else 404s. */
  trip: (id: string) => api.get<TripView>(`/orders/${id}/trip`),
  /** The background location task posts here; 1..50 points, sorted by `at`. */
  tripPoints: (id: string, points: TripPointInput[]) =>
    api.post<TripPointsResult>(`/orders/${id}/trip/points`, { points }),
  /** BJ12: the pro stops sharing (sharing is optional, docs/01 §10). */
  tripStop: (id: string) => api.post<TripView>(`/orders/${id}/trip/stop`),

  /** SA6 "Xarita va joylashuv" (super admin only). */
  mapsOverview: () => api.get<MapsOverview>('/sa/maps'),
  setMapsSettings: (input: Partial<MapsSettings>) => api.put<MapsOverview>('/sa/maps', input),

  // ---------------------------------------------------------------- stage 7 · AD1

  /** AD1 "Admin paneli" (any staff row; sections degrade instead of 403ing). */
  adminDashboard: () => api.get<AdminDashboard>('/admin/dashboard'),
  /** AD1 "Ruxsat so'rash". */
  requestPermission: (input: { permission: AdminPermission; note?: string }) =>
    api.post<PermissionRequest>('/admin/permission-requests', input),

  // ---------------------------------------------------------------- stage 7 · AD2 users

  adminUsers: (filter: AdminUserListFilter, before?: string) => {
    const params = new URLSearchParams();
    if (filter.search) params.set('search', filter.search);
    if (filter.role) params.set('role', filter.role);
    if (filter.status) params.set('status', filter.status);
    if (filter.verification) params.set('verification', filter.verification);
    if (before) params.set('before', before);
    return api.get<AdminUserListPage>(`/admin/users?${params}`);
  },
  adminUser: (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`),
  blockUser: (id: string, reason: string) =>
    api.post<AdminUserDetail>(`/admin/users/${id}/block`, { reason }),
  unblockUser: (id: string) => api.post<AdminUserDetail>(`/admin/users/${id}/unblock`),

  // ---------------------------------------------------------------- stage 7 · AD3 disputes

  adminDisputes: (status: DisputeListFilter | undefined, before?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (before) params.set('before', before);
    return api.get<DisputeListPage>(`/admin/disputes?${params}`);
  },
  adminDispute: (orderId: string) => api.get<DisputeDetail>(`/admin/disputes/${orderId}`),
  adminDisputeTrack: (orderId: string) => api.get<DisputeTrack>(`/admin/disputes/${orderId}/track`),
  decideDispute: (orderId: string, decision: DisputeDecisionValue, note?: string) =>
    api.post<DisputeDetail>(`/admin/disputes/${orderId}/decide`, { decision, note }),
  approveDispute: (orderId: string, note?: string) =>
    api.post<DisputeDetail>(`/sa/disputes/${orderId}/approve`, note ? { note } : undefined),
  rejectDispute: (orderId: string, reason: string) =>
    api.post<DisputeDetail>(`/sa/disputes/${orderId}/reject`, { reason }),
  /** SA "Tasdiqlash kutilmoqda" inbox mirroring AD3's "Super admin tasdiqlaydi" note. */
  pendingApprovalDisputes: (before?: string) =>
    api.get<DisputeListPage>(
      `/sa/disputes/pending-approval${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),

  // ---------------------------------------------------------------- stage 7 · orders moderation

  adminOrders: (filter: AdminOrderListFilter, before?: string) => {
    const params = new URLSearchParams();
    if (filter.search) params.set('search', filter.search);
    if (filter.status) params.set('status', filter.status);
    if (filter.payment_method) params.set('payment_method', filter.payment_method);
    if (filter.stuck) params.set('stuck', 'true');
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
    if (before) params.set('before', before);
    return api.get<AdminOrderListPage>(`/admin/orders?${params}`);
  },
  adminOrder: (id: string) => api.get<AdminOrderDetail>(`/admin/orders/${id}`),
  moderateCancelOrder: (id: string, reason: string) =>
    api.post<Order>(`/admin/orders/${id}/cancel`, { reason }),

  // ---------------------------------------------------------------- stage 7 · categories

  adminCategories: () => api.get<AdminCategory[]>('/admin/categories'),
  createCategory: (input: NewCategoryInput) => api.post<AdminCategory>('/admin/categories', input),
  updateCategory: (id: string, input: CategoryUpdateInput) =>
    api.put<AdminCategory>(`/admin/categories/${id}`, input),
  activateCategory: (id: string) => api.post<AdminCategory>(`/admin/categories/${id}/activate`),
  deactivateCategory: (id: string) => api.post<AdminCategory>(`/admin/categories/${id}/deactivate`),

  // ---------------------------------------------------------------- stage 7 · broadcast

  createBroadcast: (input: NewBroadcastInput) =>
    api.post<BroadcastCreateResult>('/admin/broadcasts', input),
  broadcasts: (before?: string) =>
    api.get<BroadcastListPage>(
      `/admin/broadcasts${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  broadcast: (id: string) => api.get<BroadcastDetail>(`/admin/broadcasts/${id}`),

  // ---------------------------------------------------------------- stage 7 · SA1 dashboard

  saDashboard: (period: FinancePeriod, range?: { from: string; to: string }) => {
    const params = new URLSearchParams({ period });
    if (range) {
      params.set('from', range.from);
      params.set('to', range.to);
    }
    return api.get<FinanceSummary>(`/sa/dashboard?${params}`);
  },

  // ---------------------------------------------------------------- stage 7 · SA2 settings

  saSettings: () => api.get<SaSettings>('/sa/settings'),
  updateSaSettings: (input: SaSettingsUpdate) => api.put<SaSettings>('/sa/settings', input),

  // ---------------------------------------------------------------- stage 7 · SA3 staff

  saStaff: () => api.get<StaffMember[]>('/sa/staff'),
  grantStaff: (input: { phone: string; permissions?: AdminPermission[] }) =>
    api.post<StaffMember>('/sa/staff', input),
  updateStaffPermissions: (id: string, permissions: AdminPermission[]) =>
    api.put<StaffMember>(`/sa/staff/${id}/permissions`, { permissions }),
  revokeStaff: (id: string) => api.post<void>(`/sa/staff/${id}/revoke`),
  saPermissionRequests: (status: PermissionRequestStatus = 'PENDING') =>
    api.get<AdminPermissionRequestItem[]>(`/sa/permission-requests?status=${status}`),
  decidePermissionRequest: (
    id: string,
    input: { approve: true } | { approve: false; reason: string },
  ) => api.post<AdminPermissionRequestItem>(`/sa/permission-requests/${id}/decide`, input),

  // ---------------------------------------------------------------- stage 7 · SA4 finance

  saFinanceSummary: (period: FinancePeriod, range?: { from: string; to: string }) => {
    const params = new URLSearchParams({ period });
    if (range) {
      params.set('from', range.from);
      params.set('to', range.to);
    }
    return api.get<FinanceSummary>(`/sa/finance/summary?${params}`);
  },
  saFinanceOrders: (range: { from: string; to: string }, before?: string) => {
    const params = new URLSearchParams(range);
    if (before) params.set('before', before);
    return api.get<FinanceOrdersPage>(`/sa/finance/orders?${params}`);
  },
};
