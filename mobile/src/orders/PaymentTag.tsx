import { Banknote, CreditCard, type LucideIcon, QrCode, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { PaymentMethod } from '../api/types';
import { Tag } from '../components/ui/Chip';
import { paymentKind } from './status';

export const PAYMENT_ICONS: Record<PaymentMethod, LucideIcon> = {
  BALANCE: Wallet,
  CLICK: QrCode,
  PAYME: QrCode,
  CARD: CreditCard,
  CASH: Banknote,
  XOLIS_QR: QrCode,
};

/** "Naqd" (orange) or "Karta / QR" (blue) on job cards (BJ1); `long` adds "to‘lov" (BJ2). */
export function PaymentTag({ method, long = false }: { method: PaymentMethod; long?: boolean }) {
  const { t } = useTranslation();
  const cash = paymentKind(method) === 'cash';
  return (
    <Tag
      tone={cash ? 'orange' : 'brand'}
      icon={cash ? Banknote : QrCode}
      label={
        cash ? t(long ? 'payment.cashChip' : 'executorHome.filterCash') : t('payment.onlineChip')
      }
    />
  );
}
