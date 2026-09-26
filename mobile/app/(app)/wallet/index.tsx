import { router } from 'expo-router';
import { ArrowUpRight, Gift, Info, type LucideIcon, Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet, useWalletTransactions } from '../../../src/api/queries';
import { AppText } from '../../../src/components/AppText';
import { BarHeader } from '../../../src/components/ui/BarHeader';
import { Button } from '../../../src/components/ui/Button';
import { Card, Separator } from '../../../src/components/ui/Card';
import { formatDate } from '../../../src/lib/format';
import { OrderPlaceholder } from '../../../src/orders/OrderParts';
import { useOrderTexts } from '../../../src/orders/texts';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { TransactionRow } from '../../../src/wallet/TransactionRow';
import { useErrorText } from '../../../src/api/use-error-text';

/** BJ5 "Hamyon": balance, demo bonus and the history of every movement (docs/01 §7). */
export default function WalletScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const wallet = useWallet();
  const history = useWalletTransactions();

  if (!wallet.data) {
    return (
      <OrderPlaceholder
        error={wallet.isError ? errorText(wallet.error) : null}
        onRetry={() => void wallet.refetch()}
      />
    );
  }

  const w = wallet.data;
  const real = BigInt(w.real);
  const demo = BigInt(w.demo);
  const granted = BigInt(w.demo_granted);
  const holds = BigInt(w.holds);
  const free = w.free_period?.active ? w.free_period : null;
  const showDemo = granted > 0n && (free !== null || demo > 0n);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  const refresh = () => {
    void wallet.refetch();
    void history.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('wallet.title')}
        right={
          free ? (
            <View
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 6,
                marginRight: theme.spacing.md,
                borderRadius: 999,
                backgroundColor: theme.colors.pillBg,
              }}
            >
              <AppText weight="bold" style={{ color: theme.colors.pillText }}>
                {t('wallet.freeBadge', { days: free.days_left })}
              </AppText>
            </View>
          ) : null
        }
      />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.brand}
          />
        }
      >
        <View
          style={{
            padding: theme.spacing.xl,
            gap: theme.spacing.lg,
            borderRadius: theme.radius.sheet,
            backgroundColor: theme.colors.brand,
          }}
        >
          <View>
            <AppText size="bodyLarge" style={{ color: theme.colors.barText }}>
              {t('wallet.total')}
            </AppText>
            <AppText style={{ color: theme.colors.barText }}>
              <AppText size="amountLarge" weight="bold" style={{ color: theme.colors.barText }}>
                {texts.amount(real + demo)}
              </AppText>
              <AppText size="title" weight="semibold" style={{ color: theme.colors.barText }}>
                {` ${t('common.currency')}`}
              </AppText>
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <DarkBox>
              <AppText style={{ color: theme.colors.barText2 }}>{t('wallet.real')}</AppText>
              <AppText size="title" weight="bold" style={{ color: theme.colors.barText }}>
                {texts.amount(real)}
              </AppText>
              <AppText style={{ color: theme.colors.barText2 }}>{t('wallet.realHint')}</AppText>
            </DarkBox>
            {showDemo ? (
              <DarkBox>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Gift size={16} color={theme.colors.barText2} />
                  <AppText style={{ color: theme.colors.barText2 }}>{t('wallet.demo')}</AppText>
                </View>
                <AppText style={{ color: theme.colors.barText }}>
                  <AppText size="title" weight="bold" style={{ color: theme.colors.barText }}>
                    {texts.amount(demo)}
                  </AppText>
                  <AppText style={{ color: theme.colors.barText2 }}>
                    {` ${t('wallet.demoOf', { total: texts.amount(granted) })}`}
                  </AppText>
                </AppText>
                <View
                  style={{
                    height: 6,
                    marginTop: theme.spacing.sm,
                    borderRadius: 3,
                    backgroundColor: theme.colors.barText2,
                    opacity: 0.9,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${Number((demo * 100n) / granted)}%`,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: theme.colors.barText,
                    }}
                  />
                </View>
              </DarkBox>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <CardAction
              icon={Plus}
              label={t('wallet.topUp')}
              light
              onPress={() => router.push('/wallet/topup')}
            />
            <CardAction
              icon={ArrowUpRight}
              label={t('wallet.withdraw')}
              onPress={() => router.push('/wallet/withdraw')}
            />
          </View>
        </View>

        {showDemo && free ? (
          <Card>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Info size={22} color={theme.colors.brandText} style={{ marginTop: 1 }} />
              <AppText size="bodyLarge" color="text2" style={{ flex: 1 }}>
                <Trans
                  i18nKey="wallet.demoInfo"
                  values={{ date: formatDate(new Date(free.ends_at)) }}
                  components={{ b: <AppText size="bodyLarge" weight="bold" /> }}
                />
              </AppText>
            </View>
            {holds > 0n ? (
              <AppText color="text2">{t('wallet.held', { amount: texts.money(holds) })}</AppText>
            ) : null}
          </Card>
        ) : holds > 0n ? (
          <Card>
            <AppText color="text2">{t('wallet.held', { amount: texts.money(holds) })}</AppText>
          </Card>
        ) : null}

        <Card title={t('wallet.history')} style={{ gap: 0 }}>
          {history.isPending ? (
            <ActivityIndicator color={theme.colors.brand} style={{ margin: theme.spacing.lg }} />
          ) : items.length === 0 ? (
            <AppText color="text2" style={{ paddingVertical: theme.spacing.md }}>
              {t('wallet.empty')}
            </AppText>
          ) : (
            items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Separator inset={60} /> : null}
                <TransactionRow item={item} />
              </View>
            ))
          )}
          {history.hasNextPage ? (
            <Button
              variant="link"
              title={t('wallet.more')}
              loading={history.isFetchingNextPage}
              onPress={() => void history.fetchNextPage()}
            />
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

/** Darker box inside the blue balance card. */
function DarkBox({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: theme.spacing.md,
        gap: 2,
        borderRadius: theme.radius.card,
        overflow: 'hidden',
      }}
    >
      {/* Darkened card color; the design has no separate token for it. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.colors.scrim,
          opacity: 0.35,
        }}
      />
      {children}
    </View>
  );
}

function CardAction({
  icon: Icon,
  label,
  light = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  light?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = light ? theme.colors.brandText : theme.colors.barText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        borderRadius: theme.radius.card,
        overflow: 'hidden',
        backgroundColor: light ? theme.colors.pillBg : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {light ? null : (
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: theme.colors.scrim,
            opacity: 0.35,
          }}
        />
      )}
      <Icon size={22} color={color} />
      <AppText size="bodyLarge" weight="bold" style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}
