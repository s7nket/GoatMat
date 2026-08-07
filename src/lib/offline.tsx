import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Party, PartyKind, Product } from '@/lib/database.types';
import { enqueue, flush, getJobs, type BillJob, type OutboxJob } from '@/lib/outbox';

type OfflineState = {
  /** False when the device has no usable connection, or the dev switch is on. */
  online: boolean;
  pending: OutboxJob[];
  pendingBills: BillJob[];
  /** True while the queue is being sent. */
  syncing: boolean;
  queue: (job: OutboxJob) => Promise<void>;
  sync: () => Promise<void>;
  /** Dev-only switch so offline behaviour can be tested at a desk. */
  simulateOffline: boolean;
  setSimulateOffline: (value: boolean) => void;
};

const OfflineContext = createContext<OfflineState | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const [reachable, setReachable] = useState(true);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [pending, setPending] = useState<OutboxJob[]>([]);
  const [syncing, setSyncing] = useState(false);

  const online = reachable && !simulateOffline;
  // Read inside callbacks without making them depend on it, so the sync
  // function stays stable across renders.
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const refreshPending = useCallback(async () => {
    setPending(await getJobs());
  }, []);

  const sync = useCallback(async () => {
    if (!onlineRef.current) return;

    setSyncing(true);
    try {
      const result = await flush();
      await refreshPending();
      // Only disturb the screens if something actually landed.
      if (result.sent > 0) await queryClient.invalidateQueries();
    } finally {
      setSyncing(false);
    }
  }, [queryClient, refreshPending]);

  // Load anything left over from a previous run before doing anything else.
  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null until the first probe finishes. Treating
      // that as offline would flash the banner on every cold start.
      const next = state.isConnected !== false && state.isInternetReachable !== false;
      setReachable(next);
    });
    return unsubscribe;
  }, []);

  // Flush whenever the connection comes back, and whenever the user returns to
  // the app -- a phone that regained signal while backgrounded may not fire a
  // NetInfo event we are awake for.
  useEffect(() => {
    if (online) void sync();
  }, [online, sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && onlineRef.current) void sync();
    });
    return () => subscription.remove();
  }, [sync]);

  const queue = useCallback(
    async (job: OutboxJob) => {
      setPending(await enqueue(job));
      // Screens read pending jobs to show what has not landed yet.
      await queryClient.invalidateQueries();
      if (onlineRef.current) void sync();
    },
    [queryClient, sync],
  );

  const value = useMemo<OfflineState>(
    () => ({
      online,
      pending,
      pendingBills: pending.filter(
        (job): job is BillJob => job.type === 'sale' || job.type === 'purchase',
      ),
      syncing,
      queue,
      sync,
      simulateOffline,
      setSimulateOffline,
    }),
    [online, pending, syncing, queue, sync, simulateOffline],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineState {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used inside <OfflineProvider>');
  return ctx;
}

/** Pending bills of one kind, newest first -- what the list screens prepend. */
export function usePendingBills(kind: 'sale' | 'purchase'): BillJob[] {
  const { pendingBills } = useOffline();
  return useMemo(
    () =>
      pendingBills
        .filter((job) => job.type === kind)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [pendingBills, kind],
  );
}

/**
 * Products and parties created offline exist only in the queue, but a bill
 * entered five minutes later has to be able to reference them. These hooks
 * present unsent rows in the same shape the server returns, so the pickers and
 * lists can treat them as ordinary records.
 */
export function usePendingProducts(): Product[] {
  const { pending } = useOffline();

  return useMemo(
    () =>
      pending
        .filter((job): job is Extract<OutboxJob, { type: 'product' }> => job.type === 'product')
        .map((job) => ({
          id: job.id,
          name: job.payload.name,
          size: job.payload.size,
          gsm: job.payload.gsm,
          hsn: null,
          default_rate: job.payload.default_rate,
          low_stock_at: job.payload.low_stock_at,
          notes: job.payload.notes,
          archived: false,
          created_by: null,
          created_at: job.createdAt,
          updated_at: job.createdAt,
        })),
    [pending],
  );
}

export function usePendingParties(kind?: PartyKind): Party[] {
  const { pending } = useOffline();

  return useMemo(
    () =>
      pending
        .filter((job): job is Extract<OutboxJob, { type: 'party' }> => job.type === 'party')
        .filter((job) => !kind || job.payload.kind === kind)
        .map((job) => ({
          id: job.id,
          kind: job.payload.kind,
          name: job.payload.name,
          phone: job.payload.phone,
          address: job.payload.address,
          notes: job.payload.notes,
          archived: false,
          created_by: null,
          created_at: job.createdAt,
          updated_at: job.createdAt,
        })),
    [pending, kind],
  );
}

/** Ids still sitting in the queue -- used to mark a row as not yet sent. */
export function usePendingIds(): Set<string> {
  const { pending } = useOffline();
  return useMemo(() => new Set(pending.map((job) => job.id)), [pending]);
}

/**
 * Stock and balances come from server views, so they are as stale as the last
 * sync. These deltas fold unsent bills back in, so a sale entered in a field
 * still lowers the stock the user sees.
 */
export function usePendingStockDelta(): Map<string, number> {
  const { pendingBills } = useOffline();

  return useMemo(() => {
    const delta = new Map<string, number>();
    for (const job of pendingBills) {
      const sign = job.type === 'purchase' ? 1 : -1;
      for (const item of job.payload.items) {
        delta.set(item.product_id, (delta.get(item.product_id) ?? 0) + sign * item.qty);
      }
    }
    return delta;
  }, [pendingBills]);
}

/** Positive means they owe us more once the queue lands. */
export function usePendingBalanceDelta(): Map<string, number> {
  const { pendingBills } = useOffline();

  return useMemo(() => {
    const delta = new Map<string, number>();
    for (const job of pendingBills) {
      const unpaid = job.payload.totalAmount - job.payload.paidAmount;
      const sign = job.type === 'sale' ? 1 : -1;
      delta.set(job.payload.partyId, (delta.get(job.payload.partyId) ?? 0) + sign * unpaid);
    }
    return delta;
  }, [pendingBills]);
}
