/**
 * Types for the schema in supabase/schema.sql.
 *
 * Hand-written to match that file. Once you install the Supabase CLI you can
 * regenerate this instead of maintaining it by hand:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 *
 * If you change schema.sql, change this file in the same commit.
 */

export type PaymentMode = 'cash' | 'upi' | 'bank' | 'credit';
export type PartyKind = 'supplier' | 'customer';
export type ExpenseCategory = 'transport' | 'labour' | 'rent' | 'fuel' | 'misc';

type Audit = {
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Product = Audit & {
  id: string;
  name: string;
  size: string | null;
  gsm: number | null;
  hsn: string | null;
  default_rate: number | null;
  low_stock_at: number;
  notes: string | null;
  archived: boolean;
};

export type Party = Audit & {
  id: string;
  kind: PartyKind;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  archived: boolean;
};

export type Purchase = Audit & {
  id: string;
  bill_no: number;
  supplier_id: string;
  bill_date: string;
  supplier_ref: string | null;
  total_amount: number;
  paid_amount: number;
  payment_mode: PaymentMode | null;
  notes: string | null;
  voided_at: string | null;
  voided_reason: string | null;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string;
  qty: number;
  rate: number;
  amount: number;
};

export type Sale = Audit & {
  id: string;
  bill_no: number;
  customer_id: string;
  bill_date: string;
  total_amount: number;
  paid_amount: number;
  payment_mode: PaymentMode | null;
  notes: string | null;
  voided_at: string | null;
  voided_reason: string | null;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  qty: number;
  rate: number;
  amount: number;
};

export type Payment = Audit & {
  id: string;
  party_id: string;
  pay_date: string;
  amount: number;
  direction: 'in' | 'out';
  mode: 'cash' | 'upi' | 'bank' | null;
  note: string | null;
  voided_at: string | null;
};

export type Expense = Audit & {
  id: string;
  spend_date: string;
  category: ExpenseCategory;
  amount: number;
  note: string | null;
  voided_at: string | null;
};

/** One line on a bill, as sent to create_sale / create_purchase. */
export type BillItemInput = {
  product_id: string;
  qty: number;
  rate: number;
};

export type Member = {
  user_id: string;
  full_name: string;
  role: 'owner' | 'staff';
  /** Flipped off in Supabase Studio to revoke access without deleting history. */
  active: boolean;
  created_at: string;
};

export type StockRow = {
  id: string;
  name: string;
  size: string | null;
  gsm: number | null;
  default_rate: number | null;
  low_stock_at: number;
  total_bought: number;
  total_sold: number;
  qty_left: number;
};

export type PartyBalanceRow = {
  id: string;
  kind: PartyKind;
  name: string;
  phone: string | null;
  total_billed: number;
  total_purchased: number;
  total_received: number;
  total_paid: number;
  /** Positive: they owe us. Negative: we owe them. */
  balance: number;
};

/** Columns the database fills in itself, so callers never supply them. */
type Generated = 'created_at' | 'updated_at';

/** Nullable columns are optional on insert -- omitting one means SQL NULL. */
type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T];

type Table<Row, InsertOptional extends keyof Row> = {
  Row: Row;
  Insert: Omit<Row, InsertOptional | NullableKeys<Row>> &
    Partial<Pick<Row, (InsertOptional & keyof Row) | NullableKeys<Row>>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      members: Table<Member, 'created_at'>;
      products: Table<Product, Generated | 'id' | 'archived' | 'low_stock_at' | 'created_by'>;
      parties: Table<Party, Generated | 'id' | 'archived' | 'created_by'>;
      purchases: Table<
        Purchase,
        Generated | 'id' | 'bill_no' | 'bill_date' | 'total_amount' | 'paid_amount' | 'created_by'
      >;
      purchase_items: Table<PurchaseItem, 'id' | 'amount'>;
      sales: Table<
        Sale,
        Generated | 'id' | 'bill_no' | 'bill_date' | 'total_amount' | 'paid_amount' | 'created_by'
      >;
      sale_items: Table<SaleItem, 'id' | 'amount'>;
      payments: Table<Payment, Generated | 'id' | 'pay_date' | 'created_by'>;
      expenses: Table<Expense, Generated | 'id' | 'spend_date' | 'created_by'>;
    };
    Views: {
      stock_view: { Row: StockRow; Relationships: [] };
      party_balance_view: { Row: PartyBalanceRow; Relationships: [] };
    };
    Functions: {
      is_member: { Args: Record<string, never>; Returns: boolean };
      create_sale: {
        Args: {
          p_customer_id: string;
          p_bill_date: string;
          p_payment_mode: PaymentMode | null;
          p_paid_amount: number;
          p_notes: string | null;
          p_items: BillItemInput[];
        };
        Returns: string;
      };
      create_purchase: {
        Args: {
          p_supplier_id: string;
          p_bill_date: string;
          p_supplier_ref: string | null;
          p_payment_mode: PaymentMode | null;
          p_paid_amount: number;
          p_notes: string | null;
          p_items: BillItemInput[];
        };
        Returns: string;
      };
      void_sale: { Args: { p_id: string; p_reason: string | null }; Returns: undefined };
      void_purchase: { Args: { p_id: string; p_reason: string | null }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
