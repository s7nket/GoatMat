import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { BillItemInput, PartyKind, PaymentMode } from '@/lib/database.types';
import { useOffline } from '@/lib/offline';
import { newId, newJobMeta } from '@/lib/outbox';
import { keys } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

/**
 * Anything derived from master data goes stale the moment it changes: stock
 * carries product names, balances carry party names, the dashboard carries
 * both. Rather than track that web by hand, every write clears the lot -- the
 * dataset is a few hundred rows, so a refetch costs nothing.
 */
function useInvalidateAll() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.products }),
      client.invalidateQueries({ queryKey: ['parties'] }),
      client.invalidateQueries({ queryKey: keys.stock }),
      client.invalidateQueries({ queryKey: keys.balances }),
      client.invalidateQueries({ queryKey: keys.sales }),
      client.invalidateQueries({ queryKey: keys.purchases }),
      client.invalidateQueries({ queryKey: ['ledger'] }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export type BusinessProfileInput = {
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  bill_footer: string | null;
  warranty: string | null;
  bill_terms: string | null;
};

export function useSaveBusinessProfile() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: BusinessProfileInput) => {
      // A trigger creates the row when the account is made, and RLS limits the
      // update to the caller's own, so no id is needed here.
      const { error } = await supabase.from('profiles').update(input).not('user_id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.business }),
  });
}

export type BillInput = {
  partyId: string;
  partyName: string;
  billDate: string;
  paymentMode: PaymentMode | null;
  paidAmount: number;
  totalAmount: number;
  notes: string | null;
  /** Purchases only: the supplier's own bill number. */
  supplierRef?: string | null;
  /** UTR or cheque number. Only collected for UPI and bank. */
  reference: string | null;
  items: BillItemInput[];
};

/**
 * Saving a bill never touches the network. It goes into the outbox and the
 * sync worker sends it -- immediately when there is signal, later when there
 * is not. The screen behaves identically either way, so there is no separate
 * offline code path that only gets exercised in a field somewhere.
 *
 * The bill's id is generated here rather than by Postgres, which is what makes
 * a retry safe. See supabase/005_idempotent_bills.sql.
 */
export function useCreateBill(kind: 'sale' | 'purchase') {
  const { queue, userId } = useOffline();

  return useMutation({
    mutationFn: async (input: BillInput): Promise<string> => {
      // A job with no owner could be flushed under whoever signs in next.
      // The screens are behind the auth gate, so this should be unreachable.
      if (!userId) throw new Error('Sign in before saving.');

      const id = newId();

      await queue({
        id,
        type: kind,
        ...newJobMeta(userId),
        payload: {
          partyId: input.partyId,
          partyName: input.partyName,
          billDate: input.billDate,
          paymentMode: input.paymentMode,
          paidAmount: input.paidAmount,
          totalAmount: input.totalAmount,
          notes: input.notes,
          supplierRef: input.supplierRef ?? null,
          reference: input.reference,
          items: input.items.map((item) => ({
            product_id: item.product_id,
            qty: item.qty,
            rate: item.rate,
          })),
        },
      });

      return id;
    },
  });
}

/** Bills are never edited or deleted -- void and re-enter, so history survives. */
export function useVoidBill(kind: 'sale' | 'purchase') {
  const invalidate = useInvalidateAll();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string | null }) => {
      const { error } = await supabase.rpc(kind === 'sale' ? 'void_sale' : 'void_purchase', {
        p_id: id,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type PaymentInput = {
  partyId: string;
  partyName: string;
  payDate: string;
  amount: number;
  direction: 'in' | 'out';
  mode: 'cash' | 'upi' | 'bank' | null;
  note: string | null;
  reference: string | null;
};

/** Settling an old balance, as opposed to paying at the moment of the bill. */
export function useCreatePayment() {
  const { queue, userId } = useOffline();

  return useMutation({
    mutationFn: async (input: PaymentInput): Promise<string> => {
      if (!userId) throw new Error('Sign in before saving.');

      const id = newId();
      await queue({
        id,
        type: 'payment',
        ...newJobMeta(userId),
        payload: {
          partyId: input.partyId,
          partyName: input.partyName,
          payDate: input.payDate,
          amount: input.amount,
          direction: input.direction,
          mode: input.mode,
          note: input.note,
          reference: input.reference,
        },
      });
      return id;
    },
  });
}

/** Voided, never deleted -- a receipt that vanishes is worse than one cancelled. */
export function useVoidPayment() {
  const invalidate = useInvalidateAll();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('void_payment', { p_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type ProductInput = {
  id?: string;
  name: string;
  size: string | null;
  gsm: number | null;
  default_rate: number | null;
  low_stock_at: number;
  notes: string | null;
};

/**
 * New products go through the outbox so they can be added offline. Edits do
 * not: changing a rate is a last-write-wins update, and queueing it would mean
 * a stale value from hours ago overwriting a colleague's newer one when the
 * queue finally drains.
 */
export function useSaveProduct() {
  const invalidate = useInvalidateAll();
  const { queue, userId } = useOffline();

  return useMutation({
    mutationFn: async (input: ProductInput): Promise<string> => {
      const { id, ...fields } = input;

      if (id) {
        const { error } = await supabase.from('products').update(fields).eq('id', id);
        if (error) throw error;
        return id;
      }

      if (!userId) throw new Error('Sign in before saving.');

      const newProductId = newId();
      await queue({
        id: newProductId,
        type: 'product',
        ...newJobMeta(userId),
        payload: fields,
      });
      return newProductId;
    },
    onSuccess: invalidate,
  });
}

/**
 * Products are archived, never deleted. Old bills reference them by id, and a
 * delete would either fail on the foreign key or orphan the line items.
 */
export function useArchiveProduct() {
  const invalidate = useInvalidateAll();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').update({ archived: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type PartyInput = {
  id?: string;
  kind: PartyKind;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export function useSaveParty() {
  const invalidate = useInvalidateAll();
  const { queue, userId } = useOffline();

  return useMutation({
    mutationFn: async (input: PartyInput): Promise<string> => {
      const { id, ...fields } = input;

      if (id) {
        const { error } = await supabase.from('parties').update(fields).eq('id', id);
        if (error) throw error;
        return id;
      }

      if (!userId) throw new Error('Sign in before saving.');

      const newPartyId = newId();
      await queue({
        id: newPartyId,
        type: 'party',
        ...newJobMeta(userId),
        payload: fields,
      });
      return newPartyId;
    },
    onSuccess: invalidate,
  });
}

export function useArchiveParty() {
  const invalidate = useInvalidateAll();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('parties').update({ archived: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
