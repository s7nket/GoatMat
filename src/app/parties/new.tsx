import { useLocalSearchParams } from 'expo-router';

import { PartyForm } from '@/features/party-form';
import type { PartyKind } from '@/lib/database.types';

export default function NewPartyScreen() {
  const { kind } = useLocalSearchParams<{ kind?: PartyKind }>();
  return <PartyForm id="new" kindParam={kind} />;
}
