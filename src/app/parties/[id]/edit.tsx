import { useLocalSearchParams } from 'expo-router';

import { PartyForm } from '@/features/party-form';

export default function EditPartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PartyForm id={id} />;
}
