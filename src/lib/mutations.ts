import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { BillItemInput, Party, PartyKind, PaymentMode, Product } from '@/lib/database.types';
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
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export type BillInput = {
  partyId: string;
  billDate: string;
  paymentMode: PaymentMode | null;
  paidAmount: number;
  notes: string | null;
  /** Purchases only: the supplier's own bill number. */
  supplierRef?: string | null;
  items: BillItemInput[];
};

/**
 * Bills are written through a Postgres function so the header and its lines
 * land in one transaction. Two round trips would leave a zero-total orphan
 * bill behind any time the phone dropped signal between them.
 */
export function useCreateBill(kind: 'sale' | 'purchase') {
  const invalidate = useInvalidateAll();

  return useMutation({
    mutationFn: async (input: BillInput): Promise<string> => {
      const items = input.items.map((item) => ({
        product_id: item.product_id,
        qty: item.qty,
        rate: item.rate,
      }));

      if (kind === 'sale') {
        const { data, error } = await supabase.rpc('create_sale', {
          p_customer_id: input.partyId,
          p_bill_date: input.billDate,
          p_payment_mode: input.paymentMode,
          p_paid_amount: input.paidAmount,
          p_notes: input.notes,
          p_items: items,
        });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.rpc('create_purchase', {
        p_supplier_id: input.partyId,
        p_bill_date: input.billDate,
        p_supplier_ref: input.supplierRef ?? null,
        p_payment_mode: input.paymentMode,
        p_paid_amount: input.paidAmount,
        p_notes: input.notes,
        p_items: items,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
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

export type ProductInput = {
  id?: string;
  name: string;
  size: string | null;
  gsm: number | null;
  default_rate: number | null;
  low_stock_at: number;
  notes: string | null;
};

export function useSaveProduct() {
  const invalidate = useInvalidateAll();

  return useMutation({
    mutationFn: async (input: ProductInput): Promise<Product> => {
      const { id, ...fields } = input;

      // Insert and update rather than upsert: an upsert with no id would let a
      // typo in the payload silently create a duplicate product.
      const query = id
        ? supabase.from('products').update(fields).eq('id', id)
        : supabase.from('products').insert(fields);

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
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

  return useMutation({
    mutationFn: async (input: PartyInput): Promise<Party> => {
      const { id, ...fields } = input;

      const query = id
        ? supabase.from('parties').update(fields).eq('id', id)
        : supabase.from('parties').insert(fields);

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
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
