import { Redirect } from 'expo-router';
import { usePreferences } from '../src/store/preferences';
import { useSession } from '../src/store/session';
import { useSignup } from '../src/store/signup';

/** Entry point: sends the user to the screen that matches the session state. */
export default function Index() {
  const status = useSession((state) => state.status);
  const step = useSession((state) => state.user?.onboarding_step);
  const duplicate = useSignup((state) => state.duplicate);
  const welcomed = usePreferences((state) => state.welcomed);

  if (status === 'loading') return null;
  if (status === 'offline') return <Redirect href="/offline" />;
  if (status === 'signedOut') {
    if (duplicate) return <Redirect href="/duplicate" />;
    return <Redirect href={welcomed ? '/sign' : '/welcome'} />;
  }
  if (step === 'IDENTITY') return <Redirect href="/identity" />;
  if (step === 'ROLE') return <Redirect href="/role" />;
  return <Redirect href="/home" />;
}
