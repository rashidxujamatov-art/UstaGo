import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useSession } from '../../src/store/session';
import { useSignup } from '../../src/store/signup';

/**
 * Invite link https://{APP_DOMAIN}/r/{CODE} (docs/01 §2). The code is kept for K2;
 * a signed-in user simply lands in the app.
 */
export default function InviteLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const signedOut = useSession((state) => state.status === 'signedOut');
  const setReferral = useSignup((state) => state.setReferral);

  useEffect(() => {
    if (signedOut && code) setReferral(code.toUpperCase(), null);
  }, [code, signedOut, setReferral]);

  return <Redirect href="/" />;
}
