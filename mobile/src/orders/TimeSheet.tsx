import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { dayLabel, endSlots, minutesLabel, startSlots, tashkentDateTime } from '../lib/time';
import type { DraftTime } from '../store/order-draft';
import { useTheme } from '../theme/ThemeProvider';

/** Days offered in the sheet: today (while slots are left), tomorrow, the day after. */
const DAYS = [0, 1, 2];
/** Suggested length of the window when the start changes (a display default). */
const DEFAULT_WINDOW_MIN = 120;

interface TimeSheetProps {
  visible: boolean;
  value: DraftTime | null;
  onClose: () => void;
  onChoose: (time: DraftTime) => void;
}

function initial(value: DraftTime | null): DraftTime {
  if (value && startSlots(value.day).includes(value.from)) return value;
  const day = startSlots(0).length > 0 ? 0 : 1;
  const from = startSlots(day)[0] ?? 0;
  return { day, from, to: pickEnd(from) };
}

function pickEnd(from: number, current?: number): number {
  const ends = endSlots(from);
  if (current !== undefined && ends.includes(current)) return current;
  return ends.find((end) => end >= from + DEFAULT_WINDOW_MIN) ?? ends.at(-1) ?? from;
}

/** BY2 "Qachon": day, start and end of the visit window in 30-minute steps. */
export function TimeSheet({ visible, value, onClose, onChoose }: TimeSheetProps) {
  const { t } = useTranslation();
  const [time, setTime] = useState(() => initial(value));
  const [lastVisible, setLastVisible] = useState(visible);
  if (visible !== lastVisible) {
    // Re-read the saved value each time the sheet opens.
    setLastVisible(visible);
    if (visible) setTime(initial(value));
  }

  const days = DAYS.filter((day) => startSlots(day).length > 0);
  const starts = startSlots(time.day);
  const ends = endSlots(time.from);

  const dayText = (day: number) => {
    const label = dayLabel(tashkentDateTime(day, 0));
    return 'key' in label ? t(label.key) : label.date;
  };

  const setDay = (day: number) => {
    const from = startSlots(day).includes(time.from) ? time.from : (startSlots(day)[0] ?? 0);
    setTime({ day, from, to: pickEnd(from, time.to) });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={<Button title={t('timePicker.choose')} onPress={() => onChoose(time)} />}
    >
      <AppText size="title" weight="bold" accessibilityRole="header">
        {t('timePicker.title')}
      </AppText>
      <Section title={t('timePicker.day')}>
        {days.map((day) => (
          <Chip
            key={day}
            label={dayText(day)}
            selected={time.day === day}
            onPress={() => setDay(day)}
          />
        ))}
      </Section>
      <Section title={t('timePicker.from')}>
        {starts.map((from) => (
          <Chip
            key={from}
            label={minutesLabel(from)}
            selected={time.from === from}
            onPress={() => setTime({ ...time, from, to: pickEnd(from, time.to) })}
          />
        ))}
      </Section>
      <Section title={t('timePicker.to')}>
        {ends.map((to) => (
          <Chip
            key={to}
            label={minutesLabel(to)}
            selected={time.to === to}
            onPress={() => setTime({ ...time, to })}
          />
        ))}
      </Section>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText weight="semibold" color="text2">
        {title}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
