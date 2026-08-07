import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  PageHeader,
  RowDivider,
  ScrollScreen,
  Segmented,
} from '@/components/ui';
import type { PartyKind } from '@/lib/database.types';
import { money } from '@/lib/format';
import { usePartyBalances } from '@/lib/queries';
import { spacing } from '@/theme/tokens';

export default function PartiesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [kind, setKind] = useState<PartyKind>('customer');
  const { data, isPending, isError, error, refetch, isRefetching } = usePartyBalances(kind);

  const noun = kind === 'customer' ? 'customer' : 'supplier';

  return (
    <ScrollScreen
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
      onRefresh={refetch}
      refreshing={isRefetching}>
      <PageHeader
        title="Parties"
        subtitle="Customers and suppliers"
        right={
          <Button
            label="Add"
            size="sm"
            icon="plus"
            onPress={() => router.push({ pathname: '/parties/[id]', params: { id: 'new', kind } })}
          />
        }
      />

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'customer', label: 'Customers' },
          { value: 'supplier', label: 'Suppliers' },
        ]}
      />

      {isPending ? (
        <LoadingState label="Loading balances" />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load parties.'}
          onRetry={refetch}
        />
      ) : data.length === 0 ? (
        <EmptyState
          icon="users"
          title={kind === 'customer' ? 'No customers yet' : 'No suppliers yet'}
          message={
            kind === 'customer'
              ? 'Add the people you sell mats to. Their pending udhaar shows up here.'
              : 'Add the people you buy stock from. What you still owe them shows up here.'
          }
          actionLabel={`Add ${noun}`}
          onAction={() => router.push({ pathname: '/parties/[id]', params: { id: 'new', kind } })}
        />
      ) : (
        <Card padded={false}>
          {data.map((party, index) => {
            const owed = Number(party.balance ?? 0);
            return (
              <View key={party.id}>
                {index > 0 ? <RowDivider /> : null}
                <ListRow
                  leading={<Avatar name={party.name} />}
                  title={party.name}
                  subtitle={party.phone ?? 'No phone saved'}
                  value={owed === 0 ? 'Settled' : money(Math.abs(owed))}
                  valueTone={owed === 0 ? 'muted' : owed > 0 ? 'success' : 'danger'}
                  valueCaption={owed === 0 ? undefined : owed > 0 ? 'to receive' : 'to pay'}
                  onPress={() =>
                    router.push({ pathname: '/parties/[id]', params: { id: party.id } })
                  }
                />
              </View>
            );
          })}
        </Card>
      )}
    </ScrollScreen>
  );
}
