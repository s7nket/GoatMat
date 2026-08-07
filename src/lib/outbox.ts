import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { BillItemInput, PartyKind, PaymentMode } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'goatmat.outbox.v1';

/**
 * Anything the app can write while offline.
 *
 * Every job carries the id its row will have. The phone decides it, not the
 * database, so a retry that follows a request which actually succeeded is a
 * no-op rather than a duplicate bill. See supabase/005_idempotent_bills.sql.
 */
export type OutboxJob =
  | {
      id: string;
      type: 'sale' | 'purchase';
      createdAt: string;
      attempts: number;
      lastError?: string;
      payload: {
        partyId: string;
        partyName: string;
        billDate: string;
        paymentMode: PaymentMode | null;
        paidAmount: number;
        totalAmount: number;
        notes: string | null;
        supplierRef: string | null;
        items: BillItemInput[];
      };
    }
  | {
      id: string;
      type: 'product';
      createdAt: string;
      attempts: number;
      lastError?: string;
      payload: {
        name: string;
        size: string | null;
        gsm: number | null;
        default_rate: number | null;
        low_stock_at: number;
        notes: string | null;
      };
    }
  | {
      id: string;
      type: 'party';
      createdAt: string;
      attempts: number;
      lastError?: string;
      payload: {
        kind: PartyKind;
        name: string;
        phone: string | null;
        address: string | null;
        notes: string | null;
      };
    };

export type BillJob = Extract<OutboxJob, { type: 'sale' | 'purchase' }>;

export function newId(): string {
  return Crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Storage
//
// A single AsyncStorage key holding the whole queue. Reads and writes are
// serialised through `lock` below: a save landing while the flusher is midway
// through a read-modify-write would otherwise be silently dropped.
// ---------------------------------------------------------------------------

let lock: Promise<unknown> = Promise.resolve();

function serialise<T>(work: () => Promise<T>): Promise<T> {
  const run = lock.then(work, work);
  // Keep the chain alive even when a job throws.
  lock = run.catch(() => undefined);
  return run;
}

async function readRaw(): Promise<OutboxJob[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxJob[]) : [];
  } catch {
    // A corrupt queue must not brick the app on launch. Losing an unsent bill
    // is bad; refusing to start at all is worse.
    return [];
  }
}

async function writeRaw(jobs: OutboxJob[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function getJobs(): Promise<OutboxJob[]> {
  return serialise(readRaw);
}

export function enqueue(job: OutboxJob): Promise<OutboxJob[]> {
  return serialise(async () => {
    const jobs = await readRaw();
    const next = [...jobs, job];
    await writeRaw(next);
    return next;
  });
}

export function removeJob(id: string): Promise<OutboxJob[]> {
  return serialise(async () => {
    const next = (await readRaw()).filter((job) => job.id !== id);
    await writeRaw(next);
    return next;
  });
}

async function recordFailure(id: string, message: string): Promise<void> {
  await serialise(async () => {
    const next = (await readRaw()).map((job) =>
      job.id === id ? { ...job, attempts: job.attempts + 1, lastError: message } : job,
    );
    await writeRaw(next);
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function send(job: OutboxJob): Promise<void> {
  if (job.type === 'sale') {
    const { error } = await supabase.rpc('create_sale', {
      p_id: job.id,
      p_customer_id: job.payload.partyId,
      p_bill_date: job.payload.billDate,
      p_payment_mode: job.payload.paymentMode,
      p_paid_amount: job.payload.paidAmount,
      p_notes: job.payload.notes,
      p_items: job.payload.items,
    });
    if (error) throw error;
    return;
  }

  if (job.type === 'purchase') {
    const { error } = await supabase.rpc('create_purchase', {
      p_id: job.id,
      p_supplier_id: job.payload.partyId,
      p_bill_date: job.payload.billDate,
      p_supplier_ref: job.payload.supplierRef,
      p_payment_mode: job.payload.paymentMode,
      p_paid_amount: job.payload.paidAmount,
      p_notes: job.payload.notes,
      p_items: job.payload.items,
    });
    if (error) throw error;
    return;
  }

  if (job.type === 'product') {
    const { error } = await supabase.rpc('create_product', {
      p_id: job.id,
      p_name: job.payload.name,
      p_size: job.payload.size,
      p_gsm: job.payload.gsm,
      p_default_rate: job.payload.default_rate,
      p_low_stock_at: job.payload.low_stock_at,
      p_notes: job.payload.notes,
    });
    if (error) throw error;
    return;
  }

  if (job.type === 'party') {
    const { error } = await supabase.rpc('create_party', {
      p_id: job.id,
      p_kind: job.payload.kind,
      p_name: job.payload.name,
      p_phone: job.payload.phone,
      p_address: job.payload.address,
      p_notes: job.payload.notes,
    });
    if (error) throw error;
    return;
  }

  // A job type added later without a send branch would otherwise sit in the
  // queue forever, silently.
  throw new Error(`No way to send a "${(job as OutboxJob).type}" job.`);
}

/**
 * A Postgres error means the server received the request and rejected it --
 * a missing product, a broken constraint. Retrying forever cannot fix that,
 * and a permanently stuck job blocks every bill queued behind it.
 */
function isPermanent(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (!code) return false;
  // Postgres error codes are five characters; PostgREST prefixes its own with
  // PGRST. Network failures arrive with no code at all.
  return code.length === 5 || code.startsWith('PGRST');
}

export type FlushResult = { sent: number; failed: number; remaining: number };

let flushing = false;

/**
 * Sends everything queued, oldest first, stopping at the first transient
 * failure. Order matters: a bill can reference a party created moments
 * earlier in the same offline stretch.
 */
export async function flush(): Promise<FlushResult> {
  if (flushing) return { sent: 0, failed: 0, remaining: (await getJobs()).length };
  flushing = true;

  let sent = 0;
  let failed = 0;

  try {
    const jobs = await getJobs();

    for (const job of jobs) {
      try {
        await send(job);
        await removeJob(job.id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not send.';

        if (isPermanent(error)) {
          // Drop it rather than let it wedge the queue. The bill is lost, but
          // it was never going to be accepted, and everything behind it can
          // now get through.
          await removeJob(job.id);
          failed += 1;
          continue;
        }

        await recordFailure(job.id, message);
        failed += 1;
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed, remaining: (await getJobs()).length };
}
