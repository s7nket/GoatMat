import { useQuery } from '@tanstack/react-query';

import type { Party, PartyBalanceRow, PartyKind, Product, StockRow } from '@/lib/database.types';
import { toISODate } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/** Every query key starts here so a single invalidate can clear a whole area. */
export const keys = {
  dashboard: (day: string) => ['dashboard', day] as const,
  stock: ['stock'] as const,
  balances: ['balances'] as const,
  sales: ['sales'] as const,
  purchases: ['purchases'] as const,
  parties: (kind?: string) => ['parties', kind ?? 'all'] as const,
  products: ['products'] as const,
};

export type DashboardSummary = {
  salesToday: number;
  salesCountToday: number;
  purchasesToday: number;
  purchaseCountToday: number;
  receivable: number;
  payable: number;
  lowStock: StockRow[];
};

async function fetchDashboard(day: string): Promise<DashboardSummary> {
  const [salesRes, purchasesRes, balanceRes, stockRes] = await Promise.all([
    supabase.from('sales').select('total_amount').eq('bill_date', day).is('voided_at', null),
    supabase.from('purchases').select('total_amount').eq('bill_date', day).is('voided_at', null),
    supabase.from('party_balance_view').select('balance'),
    supabase.from('stock_view').select('*'),
  ]);

  const firstError =
    salesRes.error ?? purchasesRes.error ?? balanceRes.error ?? stockRes.error ?? null;
  if (firstError) throw firstError;

  const sales = salesRes.data ?? [];
  const purchases = purchasesRes.data ?? [];
  const balances = (balanceRes.data ?? []) as Pick<PartyBalanceRow, 'balance'>[];
  const stock = (stockRes.data ?? []) as StockRow[];

  const sum = (rows: { total_amount: number }[]) =>
    rows.reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0);

  return {
    salesToday: sum(sales),
    salesCountToday: sales.length,
    purchasesToday: sum(purchases),
    purchaseCountToday: purchases.length,
    // Positive balance = money owed to us; negative = money we owe.
    receivable: balances.reduce((acc, b) => acc + Math.max(0, Number(b.balance ?? 0)), 0),
    payable: balances.reduce((acc, b) => acc + Math.max(0, -Number(b.balance ?? 0)), 0),
    lowStock: stock
      .filter((s) => s.qty_left <= s.low_stock_at)
      .sort((a, b) => a.qty_left - b.qty_left),
  };
}

export function useDashboard() {
  const day = toISODate();
  return useQuery({
    queryKey: keys.dashboard(day),
    queryFn: () => fetchDashboard(day),
  });
}

export function useStock() {
  return useQuery({
    queryKey: keys.stock,
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase.from('stock_view').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as StockRow[];
    },
  });
}

/** A bill row as the list screens need it: totals plus the party's name. */
export type BillListRow = {
  id: string;
  bill_no: number;
  bill_date: string;
  total_amount: number;
  paid_amount: number;
  payment_mode: string | null;
  voided_at: string | null;
  party: { name: string; phone: string | null } | null;
};

export type BillLine = {
  id: string;
  qty: number;
  rate: number;
  amount: number;
  product: { id: string; name: string; size: string | null; gsm: number | null } | null;
};

export type BillDetail = BillListRow & {
  notes: string | null;
  supplier_ref?: string | null;
  voided_reason: string | null;
  items: BillLine[];
};

const LIST_COLUMNS =
  'id, bill_no, bill_date, total_amount, paid_amount, payment_mode, voided_at, party:parties(name, phone)';

export function useSales() {
  return useQuery({
    queryKey: keys.sales,
    queryFn: async (): Promise<BillListRow[]> => {
      const { data, error } = await supabase
        .from('sales')
        .select(LIST_COLUMNS)
        .is('voided_at', null)
        .order('bill_date', { ascending: false })
        .order('bill_no', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as BillListRow[];
    },
  });
}

export function usePurchases() {
  return useQuery({
    queryKey: keys.purchases,
    queryFn: async (): Promise<BillListRow[]> => {
      const { data, error } = await supabase
        .from('purchases')
        .select(LIST_COLUMNS)
        .is('voided_at', null)
        .order('bill_date', { ascending: false })
        .order('bill_no', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as BillListRow[];
    },
  });
}

export function useBill(kind: 'sale' | 'purchase', id: string | undefined) {
  const table = kind === 'sale' ? 'sales' : 'purchases';
  const itemTable = kind === 'sale' ? 'sale_items' : 'purchase_items';
  const extra = kind === 'purchase' ? ', supplier_ref' : '';

  return useQuery({
    queryKey: [table, id],
    enabled: !!id && id !== 'new',
    queryFn: async (): Promise<BillDetail | null> => {
      const { data, error } = await supabase
        .from(table)
        .select(
          `${LIST_COLUMNS}, notes, voided_reason${extra}, ` +
            `items:${itemTable}(id, qty, rate, amount, product:products(id, name, size, gsm))`,
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as BillDetail | null;
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: keys.products,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: [...keys.products, id],
    // `new` is the create route, not a row -- nothing to fetch.
    enabled: !!id && id !== 'new',
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useParties(kind?: PartyKind) {
  return useQuery({
    queryKey: keys.parties(kind),
    queryFn: async (): Promise<Party[]> => {
      let q = supabase.from('parties').select('*').eq('archived', false).order('name');
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useParty(id: string | undefined) {
  return useQuery({
    queryKey: [...keys.parties(), id],
    enabled: !!id && id !== 'new',
    queryFn: async (): Promise<Party | null> => {
      const { data, error } = await supabase
        .from('parties')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function usePartyBalances(kind?: 'supplier' | 'customer') {
  return useQuery({
    queryKey: [...keys.balances, kind ?? 'all'],
    queryFn: async (): Promise<PartyBalanceRow[]> => {
      let q = supabase.from('party_balance_view').select('*').order('name');
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PartyBalanceRow[];
    },
  });
}
