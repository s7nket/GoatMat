import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Party, PartyKind, Product } from '@/lib/database.types';
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
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
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
