import { useTranslation } from 'react-i18next';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/ui/Screen';
import { StepHeader } from '../../src/components/ui/StepHeader';

/** Placeholder for U1 items that later stages build (wallet, referral, settings, help). */
export default function SoonScreen() {
  const { t } = useTranslation();
  return (
    <Screen header={<StepHeader />}>
      <AppText size="bodyLarge" color="text2">
        {t('common.comingSoon')}
      </AppText>
    </Screen>
  );
}
