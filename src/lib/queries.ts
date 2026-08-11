import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type {
  Party,
  PartyBalanceRow,
  PartyKind,
  Product,
  Profile,
  StockRow,
} from '@/lib/database.types';
import { toISODate } from '@/lib/format';
import {
  useOffline,
  usePendingBalanceDelta,
  usePendingParties,
  usePendingProducts,
  usePendingStockDelta,
} from '@/lib/offline';
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
    queryFn: async (): Promise<Profile | null> => {
      // RLS restricts this to the caller's own row, so no filter is needed.
      const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
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
  const { pendingBills } = useOffline();
  const stock = useStock();

  const query = useQuery({
    queryKey: keys.dashboard(from, to),
    queryFn: () => fetchDashboard(from, to),
  });

  // Home is the screen someone checks after a day in the field. If the day's
  // bills are still queued, showing zero would read as lost work.
  const data = useMemo((): DashboardSummary | undefined => {
    if (!query.data) return undefined;

    const inRange = pendingBills.filter(
      (job) => job.payload.billDate >= from && job.payload.billDate <= to,
    );

    const sales = inRange.filter((job) => job.type === 'sale');
    const purchases = inRange.filter((job) => job.type === 'purchase');
    const sum = (jobs: typeof inRange) =>
      jobs.reduce((acc, job) => acc + job.payload.totalAmount, 0);

    const salesTotal = query.data.salesTotal + sum(sales);
    const purchaseTotal = query.data.purchaseTotal + sum(purchases);

    let receivable = query.data.receivable;
    let payable = query.data.payable;
    for (const job of pendingBills) {
      const unpaid = job.payload.totalAmount - job.payload.paidAmount;
      if (unpaid <= 0) continue;
      if (job.type === 'sale') receivable += unpaid;
      else payable += unpaid;
    }

    return {
      ...query.data,
      salesTotal,
      salesCount: query.data.salesCount + sales.length,
      purchaseTotal,
      purchaseCount: query.data.purchaseCount + purchases.length,
      grossMargin: salesTotal - purchaseTotal,
      receivable,
      payable,
      // Low stock comes from useStock, which already folds the queue in.
      lowStock: stock.data
        .filter((row) => row.qty_left <= row.low_stock_at)
        .sort((a, b) => a.qty_left - b.qty_left),
    };
  }, [query.data, pendingBills, from, to, stock.data]);

  return { ...query, data };
}

export function useStock() {
  const delta = usePendingStockDelta();
  const pendingProducts = usePendingProducts();

  const query = useQuery({
    queryKey: keys.stock,
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase.from('stock_view').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as StockRow[];
    },
  });

  // stock_view is a server view, so it is as old as the last sync. Folding the
  // queue back in is what stops someone overselling stock they already sold
  // an hour ago with no signal.
  const data = useMemo(() => {
    const rows: StockRow[] = (query.data ?? []).map((row) => {
      const change = delta.get(row.id);
      return change ? { ...row, qty_left: row.qty_left + change } : row;
    });

    const seen = new Set(rows.map((row) => row.id));
    for (const product of pendingProducts) {
      if (seen.has(product.id)) continue;
      rows.push({
        id: product.id,
        name: product.name,
        size: product.size,
        gsm: product.gsm,
        default_rate: product.default_rate,
        low_stock_at: product.low_stock_at,
        archived: false,
        total_bought: 0,
        total_sold: 0,
        qty_left: delta.get(product.id) ?? 0,
      });
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [query.data, delta, pendingProducts]);

  return { ...query, data };
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
  party: { name: string; phone: string | null; address: string | null } | null;
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
  reference: string | null;
  voided_reason: string | null;
  items: BillLine[];
};

const LIST_COLUMNS =
  'id, bill_no, bill_date, total_amount, paid_amount, payment_mode, voided_at, ' +
  'party:parties(name, phone, address)';

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
          `${LIST_COLUMNS}, notes, reference, voided_reason${extra}, ` +
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
      const [salesRes, purchasesRes, paymentsRes] = await Promise.all([
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
        // Settlements against older bills are cash that moved in this period
        // even though the bill did not. Leaving them out made "collected"
        // mean "collected at the counter", which is not what it says.
        supabase
          .from('payments')
          .select('amount, direction')
          .gte('pay_date', from)
          .lte('pay_date', to)
          .is('voided_at', null),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

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

      for (const payment of paymentsRes.data ?? []) {
        if (payment.direction === 'in') collected += Number(payment.amount ?? 0);
        else paidOut += Number(payment.amount ?? 0);
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

/** One line in a party's history: a bill they were on, or money that moved. */
export type LedgerEntry = {
  id: string;
  kind: 'sale' | 'purchase' | 'payment';
  date: string;
  /** Bills only. */
  billNo?: number;
  /** What it does to the balance: positive means they owe more. */
  delta: number;
  amount: number;
  label: string;
  note: string | null;
  /** UTR or cheque number, when the payment had one. */
  reference?: string | null;
  pending?: boolean;
};

/**
 * Direction alone does not say what happened -- money out to a customer is a
 * refund of their advance, while money out to a supplier is an ordinary
 * payment. Both would otherwise read as "Paid".
 */
export function paymentLabel(kind: PartyKind | undefined, direction: 'in' | 'out'): string {
  if (kind === 'supplier') return direction === 'out' ? 'Paid' : 'Refund received';
  return direction === 'in' ? 'Received' : 'Refunded';
}

/**
 * A party's full history, newest first. Bills and payments live in different
 * tables and are stitched together here rather than in a view, so unsent
 * entries from the outbox can be folded into the same list.
 */
export function usePartyLedger(partyId: string | undefined, kind: PartyKind | undefined) {
  return useQuery({
    queryKey: ['ledger', partyId],
    enabled: !!partyId && partyId !== 'new',
    queryFn: async (): Promise<LedgerEntry[]> => {
      const isSupplier = kind === 'supplier';
      const columns = 'id, bill_no, bill_date, total_amount, paid_amount, notes, reference';

      // Written out per table rather than parameterised: the table and its
      // party column have to agree, and spelling both out is what lets the
      // typed client check that they do.
      const [billsRes, paymentsRes] = await Promise.all([
        isSupplier
          ? supabase
              .from('purchases')
              .select(columns)
              .eq('supplier_id', partyId!)
              .is('voided_at', null)
          : supabase.from('sales').select(columns).eq('customer_id', partyId!).is('voided_at', null),
        supabase
          .from('payments')
          .select('id, pay_date, amount, direction, mode, note, reference')
          .eq('party_id', partyId!)
          .is('voided_at', null),
      ]);

      if (billsRes.error) throw billsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const sign = isSupplier ? -1 : 1;

      const bills: LedgerEntry[] = (billsRes.data ?? []).map((bill) => ({
        id: bill.id,
        kind: isSupplier ? 'purchase' : 'sale',
        date: bill.bill_date,
        billNo: bill.bill_no,
        // Only the unpaid part moves the balance; whatever was settled at the
        // counter never became a debt.
        delta: sign * (Number(bill.total_amount) - Number(bill.paid_amount)),
        amount: Number(bill.total_amount),
        label: isSupplier ? 'Purchase' : 'Sale',
        note: bill.notes,
        reference: bill.reference,
      }));

      const payments: LedgerEntry[] = (paymentsRes.data ?? []).map((payment) => ({
        id: payment.id,
        kind: 'payment',
        date: payment.pay_date,
        delta: (payment.direction === 'in' ? -1 : 1) * Number(payment.amount),
        amount: Number(payment.amount),
        label: paymentLabel(kind, payment.direction),
        note: payment.note,
        reference: payment.reference,
      }));

      return [...bills, ...payments].sort((a, b) => b.date.localeCompare(a.date));
    },
  });
}

export function useProducts() {
  const pendingProducts = usePendingProducts();

  const query = useQuery({
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

  // Unsent products are merged in by id rather than appended: once the queue
  // drains, the server copy arrives and the local one must not double up.
  const data = useMemo(() => mergeById(query.data ?? [], pendingProducts), [
    query.data,
    pendingProducts,
  ]);

  return { ...query, data };
}

function mergeById<T extends { id: string; name: string }>(server: T[], pending: T[]): T[] {
  if (pending.length === 0) return server;
  const seen = new Set(server.map((row) => row.id));
  return [...server, ...pending.filter((row) => !seen.has(row.id))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
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
  const pendingParties = usePendingParties(kind);

  const query = useQuery({
    queryKey: keys.parties(kind),
    queryFn: async (): Promise<Party[]> => {
      let q = supabase.from('parties').select('*').eq('archived', false).order('name');
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const data = useMemo(() => mergeById(query.data ?? [], pendingParties), [
    query.data,
    pendingParties,
  ]);

  return { ...query, data };
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
  const delta = usePendingBalanceDelta();
  const pendingParties = usePendingParties(kind);

  const query = useQuery({
    queryKey: [...keys.balances, kind ?? 'all'],
    queryFn: async (): Promise<PartyBalanceRow[]> => {
      let q = supabase.from('party_balance_view').select('*').order('name');
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PartyBalanceRow[];
    },
  });

  const data = useMemo(() => {
    const rows: PartyBalanceRow[] = (query.data ?? []).map((row) => {
      const change = delta.get(row.id);
      return change ? { ...row, balance: Number(row.balance ?? 0) + change } : row;
    });

    const seen = new Set(rows.map((row) => row.id));
    for (const party of pendingParties) {
      if (seen.has(party.id)) continue;
      rows.push({
        id: party.id,
        kind: party.kind,
        name: party.name,
        phone: party.phone,
        total_billed: 0,
        total_purchased: 0,
        total_received: 0,
        total_paid: 0,
        balance: delta.get(party.id) ?? 0,
      });
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [query.data, delta, pendingParties]);

  return { ...query, data };
}
