import { useLocalSearchParams } from 'expo-router';

import { BillDetail } from '@/features/bill-detail';
import { BillEntry } from '@/features/bill-entry';

export default function SaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === 'new' ? <BillEntry kind="sale" /> : <BillDetail kind="sale" id={id} />;
}
