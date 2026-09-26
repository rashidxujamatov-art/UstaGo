import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, Order } from '../api/types';
import { categoryName } from '../lib/categories';
import { formatAmount } from '../lib/format';
import { ago, clock, type DayLabel, dayLabel, kmValue, listTime } from '../lib/time';
import { usePreferences } from '../store/preferences';

/** Money, time and name texts of the order screens in the current language. */
export function useOrderTexts() {
  const { t } = useTranslation();
  const language = usePreferences((state) => state.language);

  const day = useCallback((label: DayLabel) => ('key' in label ? t(label.key) : label.date), [t]);

  return useMemo(
    () => ({
      language,
      /** "180 000". */
      amount: (tiyin: string | bigint) => formatAmount(tiyin, language),
      /** "180 000 so‘m". */
      money: (tiyin: string | bigint) =>
        t('common.money', { amount: formatAmount(tiyin, language) }),
      /** "Bugun, 16:00 – 18:00". */
      range: (from: string, to: string) =>
        `${day(dayLabel(new Date(from)))}, ${clock(new Date(from))} – ${clock(new Date(to))}`,
      /** "Bugun, 16:00". */
      startsAt: (from: string) => `${day(dayLabel(new Date(from)))}, ${clock(new Date(from))}`,
      /** "13:40" today, otherwise "Kecha" or "21.09" (BY1). */
      listTime: (iso: string) => {
        const label = listTime(new Date(iso));
        return 'time' in label ? label.time : day(label);
      },
      /** "2 daqiqa oldin". */
      ago: (iso: string) => {
        const label = ago(new Date(iso));
        if ('n' in label) return t(label.key, { n: label.n });
        return 'key' in label ? t(label.key) : label.date;
      },
      clock: (iso: string) => clock(new Date(iso)),
      km: (meters: number) => t('common.km', { km: kmValue(meters) }),
      category: (category: Pick<Category, 'names'>) => categoryName(category, language),
      /** "Malika A." */
      customerName: (customer: Order['customer']) =>
        [customer.first_name, customer.last_initial && `${customer.last_initial}.`]
          .filter(Boolean)
          .join(' '),
      /** "Bekzod R." */
      executorShort: (executor: NonNullable<Order['executor']>) =>
        [executor.first_name, executor.last_name && `${executor.last_name[0]}.`]
          .filter(Boolean)
          .join(' '),
      /** Full address with entrance, floor, flat and landmark. */
      fullAddress: (address: Order['address']) =>
        [
          address.text,
          address.entrance && `${t('address.entrance')} ${address.entrance}`,
          address.floor && `${t('address.floor')} ${address.floor}`,
          address.apartment && `${t('address.apartment')} ${address.apartment}`,
          address.landmark,
        ]
          .filter(Boolean)
          .join(', '),
    }),
    [t, language, day],
  );
}
