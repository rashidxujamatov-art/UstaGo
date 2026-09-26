import { Check, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { Order } from '../api/types';
import { AppText } from '../components/AppText';
import { Card } from '../components/ui/Card';
import { useTheme } from '../theme/ThemeProvider';
import { type TimelineKey, timelineSteps } from './status';
import { useOrderTexts } from './texts';

const DOT = 26;

const LABELS = {
  created: 'timeline.created',
  accepted: 'timeline.accepted',
  departed: 'timeline.departed',
  arrived: 'timeline.arrived',
  started: 'timeline.started',
  finished: 'timeline.finished',
  payment: 'timeline.payment',
  cancelled: 'orderStatus.CANCELLED',
  disputed: 'timeline.disputed',
} as const satisfies Record<TimelineKey, string>;

/** BY3 "Buyurtma holati": the order's steps with their times. */
export function Timeline({ order, hint }: { order: Order; hint?: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const steps = timelineSteps(order);

  return (
    <Card title={t('order.statusSection')}>
      <View>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          const cancelled = step.key === 'cancelled' || step.key === 'disputed';
          const current = step.state === 'current';
          const next = steps[index + 1];
          return (
            <View key={step.key} style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
              <View style={{ alignItems: 'center', width: DOT }}>
                <View
                  style={{
                    width: DOT,
                    height: DOT,
                    borderRadius: DOT / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: step.state === 'done' || cancelled ? 0 : current ? 7 : 2,
                    borderColor: current ? theme.colors.brand : theme.colors.border,
                    backgroundColor: cancelled
                      ? theme.colors.red
                      : step.state === 'done'
                        ? theme.colors.green
                        : theme.colors.bg,
                  }}
                >
                  {step.state === 'done' ? (
                    <Check size={16} strokeWidth={3} color={theme.colors.bg} />
                  ) : cancelled ? (
                    <X size={16} strokeWidth={3} color={theme.colors.bg} />
                  ) : null}
                </View>
                {last ? null : (
                  <View
                    style={{
                      flex: 1,
                      width: 3,
                      minHeight: 16,
                      backgroundColor:
                        next && next.state !== 'todo' ? theme.colors.green : theme.colors.sep,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1, paddingBottom: last ? 0 : theme.spacing.lg, gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <AppText
                    size="bodyLarge"
                    weight={current ? 'bold' : 'regular'}
                    color={cancelled ? 'red' : step.state === 'todo' ? 'text2' : 'text'}
                    style={{ flex: 1 }}
                  >
                    {t(LABELS[step.key])}
                  </AppText>
                  <AppText color="text2">
                    {step.at
                      ? texts.clock(step.at)
                      : step.key === 'payment'
                        ? t(`payment.method.${order.payment_method}`)
                        : ''}
                  </AppText>
                </View>
                {current && hint ? (
                  <AppText weight="medium" color="brandText">
                    {hint}
                  </AppText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
