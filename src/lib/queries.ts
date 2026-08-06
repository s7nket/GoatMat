import { useQuery } from '@tanstack/react-query';

import type {
  BusinessProfile,
  Party,
  PartyBalanceRow,
  PartyKind,
  Product,
  StockRow,
} from '@/lib/database.types';
import { toISODate } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/** Every query key starts here so a single invalidate can clear a whole area. */
export const keys = {
  dashboard: (from: string, to: string) => ['dashboard', from, to] as const,
  stock: ['stock'] as const,
  balances: ['balances'] as const,
  sales: ['sales'] as const,
  purchases: ['purchases'] as const,
  parties: (kind?: string) => ['parties', kind ?? 'all'] as const,
  products: ['products'] as const,
  business: ['business-profile'] as const,
};

export function useBusinessProfile() {
  return useQuery({
    queryKey: keys.business,
    // Printed on every bill and changed maybe twice a year.
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<BusinessProfile | null> => {
      const { data, error } = await supabase.from('business_profile').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Home used to be hard-wired to today, which meant that at midnight the screen
 * reset to zero and yesterday's trade became unreachable. The period is now
 * chosen by the user; today is merely the default.
 */
export type DashboardPeriod = 'today' | 'yesterday' | 'week' | 'month';

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: '7 days',
  month: 'This month',
};

export function periodRange(period: DashboardPeriod): { from: string; to: string } {
  const today = new Date();

  switch (period) {
    case 'yesterday': {
      const day = new Date(today);
      day.setDate(day.getDate() - 1);
      return { from: toISODate(day), to: toISODate(day) };
    }
    case 'week': {
      const start = new Date(today);
      // Seven days inclusive of today, not today plus seven.
      start.setDate(start.getDate() - 6);
      return { from: toISODate(start), to: toISODate(today) };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toISODate(start), to: toISODate(today) };
    }
    default:
      return { from: toISODate(today), to: toISODate(today) };
  }
}

export type DashboardSummary = {
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  purchaseCount: number;
  /** Sales minus purchases over the period. Not true profit -- see the note on Home. */
  grossMargin: number;
  /** Current state, not period-scoped: what is owed right now. */
  receivable: number;
  payable: number;
  lowStock: StockRow[];
};

async function fetchDashboard(from: string, to: string): Promise<DashboardSummary> {
  const [salesRes, purchasesRes, balanceRes, stockRes] = await Promise.all([
    supabase
      .from('sales')
      .select('total_amount')
      .gte('bill_date', from)
      .lte('bill_date', to)
      .is('voided_at', null),
    supabase
      .from('purchases')
      .select('total_amount')
      .gte('bill_date', from)
      .lte('bill_date', to)
      .is('voided_at', null),
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

  const salesTotal = sum(sales);
  const purchaseTotal = sum(purchases);

  return {
    salesTotal,
    salesCount: sales.length,
    purchaseTotal,
    purchaseCount: purchases.length,
    grossMargin: salesTotal - purchaseTotal,
    // Positive balance = money owed to us; negative = money we owe.
    receivable: balances.reduce((acc, b) => acc + Math.max(0, Number(b.balance ?? 0)), 0),
    payable: balances.reduce((acc, b) => acc + Math.max(0, -Number(b.balance ?? 0)), 0),
    lowStock: stock
      .filter((s) => s.qty_left <= s.low_stock_at)
      .sort((a, b) => a.qty_left - b.qty_left),
  };
}

export function useDashboard(period: DashboardPeriod) {
  const { from, to } = periodRange(period);
  return useQuery({
    queryKey: keys.dashboard(from, to),
    queryFn: () => fetchDashboard(from, to),
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

export type ReportProductRow = {
  id: string;
  name: string;
  soldQty: number;
  soldValue: number;
  boughtQty: number;
  boughtValue: number;
};

export type ReportPartyRow = { id: string; name: string; value: number; bills: number };

export type ReportSummary = {
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  purchaseCount: number;
  margin: number;
  collected: number;
  paidOut: number;
  products: ReportProductRow[];
  topCustomers: ReportPartyRow[];
};

type ReportBill = {
  id: string;
  total_amount: number;
  paid_amount: number;
  party: { id: string; name: string } | null;
  items: { qty: number; amount: number; product: { id: string; name: string } | null }[];
};

const REPORT_COLUMNS = (itemTable: string) =>
  `id, total_amount, paid_amount, party:parties(id, name), ` +
  `items:${itemTable}(qty, amount, product:products(id, name))`;

/**
 * Aggregated in JavaScript rather than SQL. The dataset is a few hundred bills
 * a year, so one round trip and a reduce is simpler than maintaining reporting
 * views -- and it keeps the date-range logic in one readable place.
 */
export function useReport(from: string, to: string) {
  return useQuery({
    queryKey: ['report', from, to],
    queryFn: async (): Promise<ReportSummary> => {
      const [salesRes, purchasesRes] = await Promise.all([
        supabase
          .from('sales')
          .select(REPORT_COLUMNS('sale_items'))
          .gte('bill_date', from)
          .lte('bill_date', to)
          .is('voided_at', null),
        supabase
          .from('purchases')
          .select(REPORT_COLUMNS('purchase_items'))
          .gte('bill_date', from)
          .lte('bill_date', to)
          .is('voided_at', null),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (purchasesRes.error) throw purchasesRes.error;

      const sales = (salesRes.data ?? []) as unknown as ReportBill[];
      const purchases = (purchasesRes.data ?? []) as unknown as ReportBill[];

      const products = new Map<string, ReportProductRow>();
      const customers = new Map<string, ReportPartyRow>();

      function productRow(id: string, name: string): ReportProductRow {
        const existing = products.get(id);
        if (existing) return existing;
        const created: ReportProductRow = {
          id,
          name,
          soldQty: 0,
          soldValue: 0,
          boughtQty: 0,
          boughtValue: 0,
        };
        products.set(id, created);
        return created;
      }

      let salesTotal = 0;
      let collected = 0;
      for (const bill of sales) {
        salesTotal += Number(bill.total_amount ?? 0);
        collected += Number(bill.paid_amount ?? 0);

        if (bill.party) {
          const row = customers.get(bill.party.id) ?? {
            id: bill.party.id,
            name: bill.party.name,
            value: 0,
            bills: 0,
          };
          row.value += Number(bill.total_amount ?? 0);
          row.bills += 1;
          customers.set(bill.party.id, row);
        }

        for (const item of bill.items ?? []) {
          if (!item.product) continue;
          const row = productRow(item.product.id, item.product.name);
          row.soldQty += item.qty;
          row.soldValue += Number(item.amount ?? 0);
        }
      }

      let purchaseTotal = 0;
      let paidOut = 0;
      for (const bill of purchases) {
        purchaseTotal += Number(bill.total_amount ?? 0);
        paidOut += Number(bill.paid_amount ?? 0);

        for (const item of bill.items ?? []) {
          if (!item.product) continue;
          const row = productRow(item.product.id, item.product.name);
          row.boughtQty += item.qty;
          row.boughtValue += Number(item.amount ?? 0);
        }
      }

      return {
        salesTotal,
        salesCount: sales.length,
        purchaseTotal,
        purchaseCount: purchases.length,
        margin: salesTotal - purchaseTotal,
        collected,
        paidOut,
        products: [...products.values()].sort((a, b) => b.soldValue - a.soldValue),
        topCustomers: [...customers.values()].sort((a, b) => b.value - a.value).slice(0, 5),
      };
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
