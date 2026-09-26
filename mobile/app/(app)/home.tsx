import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { MainMenu } from '../../src/components/MainMenu';
import { CustomerHome } from '../../src/orders/CustomerHome';
import { ExecutorHome } from '../../src/orders/ExecutorHome';
import { useSession } from '../../src/store/session';

/** Home after onboarding: BY1 for customers, BJ1 for executors, with U1 as the side menu. */
export default function HomeScreen() {
  const role = useSession((state) => state.user?.active_role);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = () => setMenuOpen(true);

  return (
    <>
      {role === 'EXECUTOR' ? (
        <ExecutorHome
          key={`executor-${tab ?? ''}`}
          onMenu={openMenu}
          initialTab={tab === 'mine' || tab === 'history' ? tab : 'new'}
        />
      ) : (
        <CustomerHome
          key={`customer-${tab ?? ''}`}
          onMenu={openMenu}
          initialTab={tab === 'active' || tab === 'finished' ? tab : 'all'}
        />
      )}
      <MainMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
