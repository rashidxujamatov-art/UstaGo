import { type QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { endpoints } from './endpoints';

/** TanStack Query keys and hooks for server data (docs/02-arxitektura.md §11). */

export interface FeedFilter {
  nearby?: boolean;
  payment?: 'cash' | 'online';
}

export interface Coords {
  lat: number;
  lng: number;
}

export const queryKeys = {
  config: ['config'] as const,
  categories: ['categories'] as const,
  wallet: ['wallet'] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const,
  feedAll: ['feed'] as const,
  feed: (filter: FeedFilter, coords: Coords | null) => ['feed', filter, coords] as const,
  jobs: (scope: 'active' | 'history') => ['jobs', scope] as const,
  acceptPreview: (id: string) => ['accept-preview', id] as const,
  messages: (id: string) => ['messages', id] as const,
  walletTransactions: ['wallet-transactions'] as const,
  referrals: ['referrals'] as const,
  cards: ['cards'] as const,
  payment: (id: string) => ['payment', id] as const,
  withdrawPreview: (amount: string | null) => ['withdraw-preview', amount] as const,
  taxStatus: ['tax-status'] as const,
  adminVerifications: ['admin-verifications'] as const,
  adminVerification: (id: string) => ['admin-verification', id] as const,
  taxMethodsOverview: ['tax-methods-overview'] as const,
  trip: (id: string) => ['trip', id] as const,
  mapsOverview: ['maps-overview'] as const,
};

export const useConfig = () => useQuery({ queryKey: queryKeys.config, queryFn: endpoints.config });

export const useCategories = () =>
  useQuery({
    queryKey: queryKeys.categories,
    queryFn: endpoints.categories,
    staleTime: 60 * 60_000,
  });

export const useWallet = () => useQuery({ queryKey: queryKeys.wallet, queryFn: endpoints.wallet });

/** BY1 list; the tabs filter it on the device so their counters stay in sync. */
export const useMyOrders = () =>
  useQuery({ queryKey: queryKeys.orders, queryFn: () => endpoints.myOrders('all') });

export const useOrder = (id: string, enabled = true) =>
  useQuery({ queryKey: queryKeys.order(id), queryFn: () => endpoints.order(id), enabled });

/** New jobs are not pushed to every executor, so the feed also refreshes on a timer. */
export const useFeed = (filter: FeedFilter, coords: Coords | null) =>
  useQuery({
    queryKey: queryKeys.feed(filter, coords),
    queryFn: () => endpoints.feed({ ...filter, ...coords }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

export const useMyJobs = (scope: 'active' | 'history') =>
  useQuery({ queryKey: queryKeys.jobs(scope), queryFn: () => endpoints.myJobs(scope) });

export const useAcceptPreview = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.acceptPreview(id),
    queryFn: () => endpoints.acceptPreview(id),
    enabled,
    staleTime: 0,
  });

export const useMessages = (id: string) =>
  useQuery({
    queryKey: queryKeys.messages(id),
    queryFn: () => endpoints.messages(id),
    staleTime: 0,
  });

/** BJ5 "Tarix", page by page. */
export const useWalletTransactions = () =>
  useInfiniteQuery({
    queryKey: queryKeys.walletTransactions,
    queryFn: ({ pageParam }) => endpoints.walletTransactions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
  });

export const useReferrals = () =>
  useQuery({ queryKey: queryKeys.referrals, queryFn: endpoints.referrals });

export const useCards = () => useQuery({ queryKey: queryKeys.cards, queryFn: endpoints.cards });

/** A payment in progress; polls while it is open (the payment.status event also refreshes it). */
export const usePayment = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.payment(id ?? ''),
    queryFn: () => endpoints.payment(id ?? ''),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'CREATED' || status === 'PENDING' ? 4_000 : false;
    },
  });

export const useWithdrawPreview = (amount: string | null) =>
  useQuery({
    queryKey: queryKeys.withdrawPreview(amount),
    queryFn: () => endpoints.withdrawPreview(amount ?? undefined),
    placeholderData: (previous) => previous,
  });

/** BJ8/BJ9 "Soliq holati". */
export const useTaxStatus = () =>
  useQuery({ queryKey: queryKeys.taxStatus, queryFn: endpoints.taxStatus });

/** AD1 "Hujjat murojaatlari". */
export const useAdminVerifications = () =>
  useQuery({ queryKey: queryKeys.adminVerifications, queryFn: endpoints.adminVerifications });

export const useAdminVerification = (id: string) =>
  useQuery({
    queryKey: queryKeys.adminVerification(id),
    queryFn: () => endpoints.adminVerification(id),
  });

/** SA5 "Soliq usullari". */
export const useTaxMethodsOverview = () =>
  useQuery({ queryKey: queryKeys.taxMethodsOverview, queryFn: endpoints.taxMethodsOverview });

/**
 * BJ12/BY7/BY8 "Usta yo'lda": the initial read; live updates then come from `trip.position`,
 * `trip.eta` and `trip.ended` (customer) or a plain poll while ACTIVE (the pro's own screen,
 * which only receives `trip.ended` over the socket).
 */
export const useOrderTrip = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.trip(id),
    queryFn: () => endpoints.trip(id),
    enabled,
    refetchInterval: (query) => (query.state.data?.status === 'ACTIVE' ? 15_000 : false),
  });

/** SA6 "Xarita va joylashuv". */
export const useMapsOverview = () =>
  useQuery({ queryKey: queryKeys.mapsOverview, queryFn: endpoints.mapsOverview });

/** Everything that shows an order, its lists or the balance it holds. */
export function invalidateOrder(client: QueryClient, orderId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.order(orderId) });
  void client.invalidateQueries({ queryKey: queryKeys.orders });
  void client.invalidateQueries({ queryKey: queryKeys.feedAll });
  void client.invalidateQueries({ queryKey: ['jobs'] });
  void client.invalidateQueries({ queryKey: queryKeys.acceptPreview(orderId) });
  void client.invalidateQueries({ queryKey: queryKeys.wallet });
  void client.invalidateQueries({ queryKey: queryKeys.walletTransactions });
}
