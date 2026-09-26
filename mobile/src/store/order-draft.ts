import { create } from 'zustand';
import type { PaymentMethod } from '../api/types';
import type { UploadedPhoto } from '../lib/upload';

export interface DraftAddress {
  text: string;
  lat: number;
  lng: number;
  entrance: string;
  floor: string;
  apartment: string;
  landmark: string;
}

export interface DraftTime {
  /** 0 = today, 1 = tomorrow … (Tashkent calendar). */
  day: number;
  /** Minutes after midnight. */
  from: number;
  to: number;
}

interface OrderDraftState {
  categoryId: string | null;
  title: string;
  description: string;
  photos: UploadedPhoto[];
  address: DraftAddress | null;
  time: DraftTime | null;
  /** Whole so‘m digits as typed. */
  price: string;
  method: PaymentMethod | null;
  set: (patch: Partial<Omit<OrderDraftState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const empty = {
  categoryId: null,
  title: '',
  description: '',
  photos: [],
  address: null,
  time: null,
  price: '',
  method: null,
};

/** BY2 form, shared with the map screen (BY6) so nothing is lost when going there and back. */
export const useOrderDraft = create<OrderDraftState>()((set) => ({
  ...empty,
  set: (patch) => set(patch),
  reset: () => set(empty),
}));
