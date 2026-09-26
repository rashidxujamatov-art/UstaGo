import * as Clipboard from 'expo-clipboard';
import { ArrowRight, Copy, Link, type LucideIcon, Share2, User, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReferrals } from '../../src/api/queries';
import { useErrorText } from '../../src/api/use-error-text';
import { AppText } from '../../src/components/AppText';
import { BarHeader } from '../../src/components/ui/BarHeader';
import { Button } from '../../src/components/ui/Button';
import { Card, Separator } from '../../src/components/ui/Card';
import { appBranding } from '../../src/lib/app-config';
import { formatPercent } from '../../src/lib/format';
import { initials } from '../../src/lib/input';
import { showNotice } from '../../src/lib/notice';
import { OrderPlaceholder } from '../../src/orders/OrderParts';
import { useOrderTexts } from '../../src/orders/texts';
import { useSession } from '../../src/store/session';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { ColorToken } from '../../src/theme/tokens';

const { appName } = appBranding();

/** U2 "Referal dasturi": two referral levels, the bonuses and the invite link (docs/01 §6). */
export default function ReferralScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const firstName = useSession((state) => state.user?.identity?.first_name ?? '');
  const referrals = useReferrals();

  if (!referrals.data) {
    return (
      <OrderPlaceholder
        error={referrals.isError ? errorText(referrals.error) : null}
        onRetry={() => void referrals.refetch()}
      />
    );
  }
  const data = referrals.data;
  const linkText = data.link.replace(/^https:\/\//, '');

  const copy = async () => {
    await Clipboard.setStringAsync(data.link);
    showNotice(t('referral.copied'));
  };
  const share = () =>
    void Share.share({ message: t('referral.shareMessage', { appName, link: data.link }) });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('referral.title')} />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={referrals.isRefetching}
            onRefresh={() => void referrals.refetch()}
            tintColor={theme.colors.brand}
          />
        }
      >
        <Card style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <AppText size="titleLarge" weight="bold" accessibilityRole="header">
              {t('referral.heading')}
            </AppText>
            <AppText size="bodyLarge" color="text2">
              {t('referral.sub')}
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Level color="brand" label={firstName}>
              <AppText size="bodyLarge" weight="bold" style={{ color: theme.colors.barText }}>
                {t('referral.you')}
              </AppText>
            </Level>
            <Arrow />
            <Level
              color="green"
              icon={User}
              label={t('referral.level1')}
              percent={`${formatPercent(data.l1_bps)}%`}
              people={t('referral.people', { count: data.l1_count })}
            />
            <Arrow />
            <Level
              color="orange"
              icon={Users}
              label={t('referral.level2')}
              percent={`${formatPercent(data.l2_bps)}%`}
              people={t('referral.people', { count: data.l2_count })}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.greenSoft,
            }}
          >
            <AppText size="bodyLarge" weight="medium" style={{ flex: 1 }}>
              {t('referral.total')}
            </AppText>
            <AppText size="title" weight="bold" color="green">
              {texts.money(data.total)}
            </AppText>
          </View>
          <AppText color="text2">{t('referral.note')}</AppText>
        </Card>

        <Card>
          <AppText size="bodyLarge" weight="semibold" color="text2">
            {t('referral.linkTitle')}
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingLeft: theme.spacing.lg,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.surface2,
            }}
          >
            <Link size={22} color={theme.colors.brandText} />
            <AppText size="bodyLarge" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
              {linkText}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('referral.copy')}
              onPress={() => void copy()}
              style={{
                width: theme.size.touchTarget + 8,
                height: theme.size.touchTarget + 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Copy size={24} color={theme.colors.brandText} />
            </Pressable>
          </View>
          <Button icon={Share2} title={t('referral.share')} onPress={share} />
        </Card>

        <Card title={t('referral.recent')} style={{ gap: 0 }}>
          {data.recent.length === 0 ? (
            <AppText color="text2" style={{ paddingVertical: theme.spacing.md }}>
              {t('referral.recentEmpty')}
            </AppText>
          ) : (
            data.recent.map((bonus, index) => (
              <View key={bonus.id}>
                {index > 0 ? <Separator inset={60} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                    paddingVertical: theme.spacing.md,
                  }}
                >
                  <Circle color={bonus.level === 1 ? 'green' : 'orange'} size={48}>
                    <AppText weight="bold" style={{ color: theme.colors.barText }}>
                      {initials(bonus.from?.first_name, bonus.from?.last_name)}
                    </AppText>
                  </Circle>
                  <View style={{ flex: 1 }}>
                    <AppText size="bodyLarge" weight="semibold">
                      {[bonus.from?.first_name, bonus.from?.last_name].filter(Boolean).join(' ')}
                    </AppText>
                    <AppText color="text2">
                      {t('referral.recentSub', {
                        level: t(bonus.level === 1 ? 'referral.level1' : 'referral.level2'),
                        price: bonus.order_price ? texts.amount(bonus.order_price) : '',
                      })}
                    </AppText>
                  </View>
                  <AppText size="bodyLarge" weight="bold" color="green">
                    {`+${texts.amount(bonus.amount)}`}
                  </AppText>
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

function Circle({
  color,
  size,
  children,
}: {
  color: ColorToken;
  size: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors[color],
      }}
    >
      {children}
    </View>
  );
}

/** One node of the "Siz → 1-qatlam → 2-qatlam" chain. */
function Level({
  color,
  icon: Icon,
  label,
  percent,
  people,
  children,
}: {
  color: ColorToken;
  icon?: LucideIcon;
  label: string;
  percent?: string;
  people?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Circle color={color} size={56}>
        {Icon ? <Icon size={26} color={theme.colors.barText} /> : children}
      </Circle>
      <AppText weight="bold" style={{ marginTop: theme.spacing.xs, textAlign: 'center' }}>
        {label}
      </AppText>
      {percent ? (
        <AppText weight="bold" color="green">
          {percent}
        </AppText>
      ) : null}
      {people ? <AppText color="text2">{people}</AppText> : null}
    </View>
  );
}

function Arrow() {
  const theme = useTheme();
  return (
    <View style={{ height: 56, justifyContent: 'center' }}>
      <ArrowRight size={22} color={theme.colors.text2} />
    </View>
  );
}
