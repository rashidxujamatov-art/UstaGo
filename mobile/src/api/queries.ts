import { type QueryClient, useQuery } from '@tanstack/react-query';
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

export const useOrder = (id: string) =>
  useQuery({ queryKey: queryKeys.order(id), queryFn: () => endpoints.order(id) });

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

/** Everything that shows an order, its lists or the balance it holds. */
export function invalidateOrder(client: QueryClient, orderId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.order(orderId) });
  void client.invalidateQueries({ queryKey: queryKeys.orders });
  void client.invalidateQueries({ queryKey: queryKeys.feedAll });
  void client.invalidateQueries({ queryKey: ['jobs'] });
  void client.invalidateQueries({ queryKey: queryKeys.acceptPreview(orderId) });
  void client.invalidateQueries({ queryKey: queryKeys.wallet });
}
