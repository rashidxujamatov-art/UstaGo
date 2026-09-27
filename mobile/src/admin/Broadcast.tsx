import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminBroadcasts } from '../api/queries';
import type { BroadcastTarget, Language } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { BoxField } from '../components/ui/BoxField';
import { Button } from '../components/ui/Button';
import { Card, Separator } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Tag } from '../components/ui/Chip';
import { showNotice } from '../lib/notice';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';

const LANGS: Language[] = ['uz', 'ru', 'en', 'tg'];
const TITLE_MAX = 100;
const BODY_MAX = 500;

/** `notifications.broadcast`: compose, target, send, and the send history. */
export function Broadcast() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const history = useAdminBroadcasts();
  const [target, setTarget] = useState<BroadcastTarget>('ALL');
  const [title, setTitle] = useState<Record<Language, string>>({ uz: '', ru: '', en: '', tg: '' });
  const [body, setBody] = useState<Record<Language, string>>({ uz: '', ru: '', en: '', tg: '' });
  const [sending, setSending] = useState(false);

  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const valid = LANGS.every(
    (lang) => title[lang].trim().length > 0 && body[lang].trim().length > 0,
  );

  const send = async () => {
    setSending(true);
    try {
      const result = await endpoints.createBroadcast({ target, title, body });
      showNotice(t('admin.broadcastSent', { count: result.estimated_recipients }));
      setTitle({ uz: '', ru: '', en: '', tg: '' });
      setBody({ uz: '', ru: '', en: '', tg: '' });
      void client.invalidateQueries({ queryKey: queryKeys.adminBroadcasts });
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.broadcastTitle')} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card>
          <AppText weight="bold">{t('admin.broadcastTarget')}</AppText>
          <Segmented
            value={target}
            onChange={setTarget}
            options={[
              { value: 'ALL', label: t('admin.broadcastTargetALL') },
              { value: 'CUSTOMER', label: t('admin.broadcastTargetCUSTOMER') },
              { value: 'EXECUTOR', label: t('admin.broadcastTargetEXECUTOR') },
            ]}
          />
        </Card>

        <Card>
          {LANGS.map((lang) => (
            <BoxField
              key={lang}
              label={t('admin.broadcastTitleLabel', { lang: lang.toUpperCase() })}
              value={title[lang]}
              onChangeText={(text) => setTitle((prev) => ({ ...prev, [lang]: text }))}
              maxLength={TITLE_MAX}
            />
          ))}
        </Card>

        <Card>
          {LANGS.map((lang) => (
            <BoxField
              key={lang}
              label={t('admin.broadcastBodyLabel', { lang: lang.toUpperCase() })}
              value={body[lang]}
              onChangeText={(text) => setBody((prev) => ({ ...prev, [lang]: text }))}
              maxLength={BODY_MAX}
              multiline
            />
          ))}
        </Card>

        <Button
          icon={Send}
          title={t('admin.broadcastSend')}
          loading={sending}
          disabled={!valid}
          onPress={() => void send()}
        />

        <Card title={t('admin.broadcastHistory')} style={{ gap: 0 }}>
          {history.isPending ? (
            <ActivityIndicator color={theme.colors.brand} style={{ margin: theme.spacing.lg }} />
          ) : items.length === 0 ? (
            <AppText color="text2" style={{ paddingVertical: theme.spacing.md }}>
              {t('admin.broadcastEmpty')}
            </AppText>
          ) : (
            items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Separator inset={0} /> : null}
                <BroadcastRow
                  target={item.target}
                  title={item.title}
                  recipients={item.recipients_count}
                  status={item.status}
                  createdAt={item.created_at}
                />
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

function BroadcastRow({
  target,
  title,
  recipients,
  status,
  createdAt,
}: {
  target: BroadcastTarget;
  title: Record<Language, string>;
  recipients: number;
  status: 'QUEUED' | 'SENDING' | 'DONE';
  createdAt: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();

  return (
    <View style={{ paddingVertical: theme.spacing.sm, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <AppText weight="bold" style={{ flex: 1 }} numberOfLines={1}>
          {title[texts.language] || title.uz}
        </AppText>
        <Tag
          label={t(`admin.broadcastStatus${status}`)}
          tone={status === 'DONE' ? 'green' : 'neutral'}
        />
      </View>
      <AppText color="text2" size="secondary">
        {t(`admin.broadcastTarget${target}`)} · {recipients} · {texts.ago(createdAt)}
      </AppText>
    </View>
  );
}
