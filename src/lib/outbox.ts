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
/**
 * Where a job is in its life.
 *
 * - `queued`  waiting for a connection, or waiting out its backoff
 * - `failed`  the server rejected it, or it ran out of attempts. Needs a
 *             person. Never sent again on its own, never deleted on its own.
 *
 * Nothing is ever discarded silently. With two users someone notices a missing
 * bill; with ten nobody does, and the only trace it ever existed is here.
 */
export type JobStatus = 'queued' | 'failed';

type JobMeta = {
  id: string;
  /**
   * Who queued it. Rows are stamped with `auth.uid()` by Postgres, so sending
   * one account's queued bill while a different account is signed in would
   * file it under the wrong business. The queue survives sign-out, so this is
   * not hypothetical.
   */
  userId: string;
  createdAt: string;
  attempts: number;
  status: JobStatus;
  /** Epoch ms. The flusher skips the job until this passes. */
  nextAttemptAt: number;
  lastError?: string;
};

export type OutboxJob =
  | (JobMeta & {
      type: 'sale' | 'purchase';
      payload: {
        partyId: string;
        partyName: string;
        billDate: string;
        paymentMode: PaymentMode | null;
        paidAmount: number;
        totalAmount: number;
        notes: string | null;
        supplierRef: string | null;
        /** UTR or cheque number. Only meaningful for UPI and bank. */
        reference: string | null;
        items: BillItemInput[];
      };
    })
  | (JobMeta & {
      type: 'product';
      payload: {
        name: string;
        size: string | null;
        gsm: number | null;
        spec: string | null;
        width_ft: number | null;
        length_ft: number | null;
        default_rate: number | null;
        low_stock_at: number;
        notes: string | null;
      };
    })
  | (JobMeta & {
      type: 'party';
      payload: {
        kind: PartyKind;
        name: string;
        phone: string | null;
        address: string | null;
        notes: string | null;
      };
    })
  | (JobMeta & {
      type: 'payment';
      payload: {
        partyId: string;
        partyName: string;
        payDate: string;
        amount: number;
        /** 'in' is money received from a customer, 'out' is paid to a supplier. */
        direction: 'in' | 'out';
        mode: 'cash' | 'upi' | 'bank' | null;
        note: string | null;
        reference: string | null;
      };
    });

export type BillJob = Extract<OutboxJob, { type: 'sale' | 'purchase' }>;

export function newId(): string {
  return Crypto.randomUUID();
}

/**
 * Roughly a day of trying before a job is handed to a person. Retrying past
 * that is not persistence, it is a hidden problem.
 */
const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60 * 60 * 1000;

/**
 * Exponential backoff with jitter. Without the backoff, a phone in a bad
 * signal area retries on every connectivity flap and every app foreground,
 * flattening its battery to no purpose. Without the jitter, every device that
 * regained signal from the same tower would retry in lockstep.
 */
function backoffFor(attempts: number): number {
  const delay = Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
  return Date.now() + delay * (0.5 + Math.random() * 0.5);
}

export function newJobMeta(
  userId: string,
): Pick<JobMeta, 'userId' | 'createdAt' | 'attempts' | 'status' | 'nextAttemptAt'> {
  return {
    userId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'queued',
    nextAttemptAt: 0,
  };
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

/** Every job on the device, whoever queued it. */
export function getAllJobs(): Promise<OutboxJob[]> {
  return serialise(readRaw);
}

/** Only the signed-in account's jobs. What the UI and the flusher act on. */
export async function getJobs(userId: string | null): Promise<OutboxJob[]> {
  if (!userId) return [];
  return (await serialise(readRaw)).filter((job) => job.userId === userId);
}

export function enqueue(job: OutboxJob): Promise<OutboxJob[]> {
  return serialise(async () => {
    const jobs = await readRaw();
    const next = [...jobs, job];
    await writeRaw(next);
    return next.filter((j) => j.userId === job.userId);
  });
}

export function removeJob(id: string, userId: string | null): Promise<OutboxJob[]> {
  return serialise(async () => {
    const next = (await readRaw()).filter((job) => job.id !== id);
    await writeRaw(next);
    return next.filter((job) => job.userId === userId);
  });
}

async function patchJob(id: string, patch: Partial<JobMeta>): Promise<void> {
  await serialise(async () => {
    const next = (await readRaw()).map((job) => (job.id === id ? { ...job, ...patch } : job));
    await writeRaw(next);
  });
}

/** Puts a failed job back in line, from the top. */
export function retryJob(id: string, userId: string | null): Promise<OutboxJob[]> {
  return serialise(async () => {
    const next = (await readRaw()).map((job) =>
      job.id === id
        ? { ...job, status: 'queued' as const, attempts: 0, nextAttemptAt: 0, lastError: undefined }
        : job,
    );
    await writeRaw(next);
    return next.filter((job) => job.userId === userId);
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
      p_reference: job.payload.reference,
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
      p_reference: job.payload.reference,
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
      p_spec: job.payload.spec,
      p_width_ft: job.payload.width_ft,
      p_length_ft: job.payload.length_ft,
      p_default_rate: job.payload.default_rate,
      p_low_stock_at: job.payload.low_stock_at,
      p_notes: job.payload.notes,
    });
    if (error) throw error;
    return;
  }

  if (job.type === 'payment') {
    const { error } = await supabase.rpc('create_payment', {
      p_id: job.id,
      p_party_id: job.payload.partyId,
      p_pay_date: job.payload.payDate,
      p_amount: job.payload.amount,
      p_direction: job.payload.direction,
      p_mode: job.payload.mode,
      p_note: job.payload.note,
      p_reference: job.payload.reference,
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

/**
 * What to show on the failed card.
 *
 * Supabase rejects with a plain object, not an Error, so `instanceof` threw the
 * only useful part away and every failure read "Could not send." -- which is
 * exactly what the card already says. `hint` and `details` carry the part that
 * names the actual column or function.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  const e = error as { message?: string; details?: string; hint?: string; code?: string } | null;
  const text = [e?.message, e?.details, e?.hint].filter(Boolean).join(' — ');
  if (!text) return 'Could not send.';
  return e?.code ? `${text} (${e.code})` : text;
}

export type FlushResult = { sent: number; failed: number; remaining: number };

let flushing = false;

/**
 * Sends the queue oldest first.
 *
 * Order matters, because a bill can reference a party created minutes earlier
 * in the same offline stretch. So a transient failure stops the run rather
 * than skipping ahead.
 *
 * Jobs already marked `failed` are stepped over instead. They are not going to
 * send on their own, and leaving one at the head of the queue would freeze
 * every bill behind it -- with no way out short of reinstalling the app.
 */
export async function flush(userId: string | null): Promise<FlushResult> {
  if (!userId) return { sent: 0, failed: 0, remaining: 0 };
  if (flushing) return { sent: 0, failed: 0, remaining: (await getJobs(userId)).length };
  flushing = true;

  let sent = 0;
  let failed = 0;

  try {
    // Only this account's jobs. Another owner's queued bills stay untouched
    // until they sign in again -- they are theirs to send, not ours.
    const jobs = await getJobs(userId);
    const now = Date.now();

    for (const job of jobs) {
      if (job.status === 'failed') continue;

      // Still serving its backoff. Stop rather than skip: whatever follows was
      // queued later and may depend on this one.
      if (job.nextAttemptAt > now) break;

      try {
        await send(job);
        await removeJob(job.id, userId);
        sent += 1;
      } catch (error) {
        const message = messageOf(error);
        const attempts = job.attempts + 1;

        // A Postgres or PostgREST error means the server received this and
        // refused it. More attempts cannot change that answer.
        const giveUp = isPermanent(error) || attempts >= MAX_ATTEMPTS;

        await patchJob(job.id, {
          attempts,
          lastError: message,
          status: giveUp ? 'failed' : 'queued',
          nextAttemptAt: giveUp ? 0 : backoffFor(attempts),
        });

        failed += 1;

        // A rejected job is now inert and no longer blocks the queue, so carry
        // on. A network failure means the connection is gone -- stop.
        if (giveUp) continue;
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed, remaining: (await getJobs(userId)).length };
}
