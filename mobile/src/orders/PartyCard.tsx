import { router } from 'expo-router';
import { MessageSquare, Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { Order } from '../api/types';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { initials } from '../lib/input';
import { callPhone } from '../lib/maps';
import { useTheme } from '../theme/ThemeProvider';
import { isChatOpen } from './status';

interface PartyCardProps {
  order: Order;
  firstName: string;
  lastName: string;
  subtitle: string;
  phone: string | null;
}

/** The other person of the job with "Qo‘ng‘iroq" and "Yozish" (BY3 top card). */
export function PartyCard({ order, firstName, lastName, subtitle, phone }: PartyCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const chat = isChatOpen(order.status);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <Avatar initials={initials(firstName, lastName)} size={60} />
        <View style={{ flex: 1 }}>
          <AppText size="bar" weight="bold">
            {[firstName, lastName].filter(Boolean).join(' ')}
          </AppText>
          <AppText color="text2">{subtitle}</AppText>
        </View>
      </View>
      {phone || chat ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          {phone ? (
            <Button
              variant="secondary"
              icon={Phone}
              title={t('common.call')}
              onPress={() => callPhone(phone)}
              style={{ flex: 1 }}
            />
          ) : null}
          {chat ? (
            <Button
              variant="secondary"
              icon={MessageSquare}
              title={t('common.write')}
              onPress={() =>
                router.push({ pathname: '/order/[id]/chat', params: { id: order.id } })
              }
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
