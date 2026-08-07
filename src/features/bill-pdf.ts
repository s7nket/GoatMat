import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { Profile } from '@/lib/database.types';
import { money, prettyDate } from '@/lib/format';
import type { BillDetail } from '@/lib/queries';

/**
 * Anything from the database can contain characters that would break out of the
 * surrounding markup. Every interpolated value goes through here.
 */
function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Hand-rolled rather than relying on `atob`, whose presence in Hermes has
 * varied across React Native versions. A bill failing to send because a global
 * went missing is not a debugging session worth having.
 */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);

  let buffer = 0;
  let bits = 0;
  let out = 0;

  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, out);
}

function fileNameFor(kind: 'sale' | 'purchase', bill: BillDetail): string {
  const party = (bill.party?.name ?? 'party')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${kind === 'sale' ? 'Bill' : 'Purchase'}-${bill.bill_no}-${party || 'party'}.pdf`;
}

export function buildBillHtml({
  kind,
  bill,
  business,
}: {
  kind: 'sale' | 'purchase';
  bill: BillDetail;
  business: Profile | null;
}): string {
  const isSale = kind === 'sale';
  const balance = Number(bill.total_amount) - Number(bill.paid_amount);
  const totalPieces = bill.items.reduce((sum, item) => sum + item.qty, 0);

  const rows = bill.items
    .map((item, index) => {
      const description = [item.product?.size, item.product?.gsm ? `${item.product.gsm} GSM` : null]
        .filter(Boolean)
        .join(' · ');
      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>
            <div class="name">${escapeHtml(item.product?.name ?? 'Removed product')}</div>
            ${description ? `<div class="muted">${escapeHtml(description)}</div>` : ''}
          </td>
          <td class="num">${item.qty}</td>
          <td class="num">${money(item.rate, { decimals: true })}</td>
          <td class="num strong">${money(item.amount, { decimals: true })}</td>
        </tr>`;
    })
    .join('');

  const contactLine = [business?.phone, business?.address].filter(Boolean).map(escapeHtml).join(' · ');

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      /* Self-contained: no web fonts, no remote assets. The PDF has to render
         identically on a phone with no signal. */
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px 28px;
        font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #0F1720;
        font-size: 13px;
        line-height: 1.5;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid #137A4C;
      }
      .business { font-size: 20px; font-weight: 700; color: #0A3D26; letter-spacing: -0.3px; }
      .muted { color: #64748B; font-size: 11px; }
      .doc-type {
        text-align: right;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #64748B;
      }
      .bill-no { font-size: 18px; font-weight: 700; }
      .parties { display: flex; justify-content: space-between; gap: 24px; margin: 20px 0 16px; }
      .label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #94A3B8;
        margin-bottom: 2px;
      }
      .party-name { font-weight: 600; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      thead th {
        text-align: left;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #64748B;
        border-bottom: 1px solid #CBD5E1;
        padding: 8px 6px;
      }
      tbody td { padding: 10px 6px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
      .num { text-align: right; white-space: nowrap; }
      thead th.num { text-align: right; }
      .name { font-weight: 500; }
      .strong { font-weight: 600; }
      .totals { margin-top: 18px; display: flex; justify-content: flex-end; }
      .totals table { width: 260px; }
      .totals td { padding: 6px 0; border: none; }
      .totals .grand td {
        border-top: 1px solid #CBD5E1;
        padding-top: 10px;
        font-size: 16px;
        font-weight: 700;
      }
      .due { color: #DC2626; font-weight: 600; }
      .settled { color: #137A4C; font-weight: 600; }
      .voided {
        margin: 16px 0;
        padding: 10px 12px;
        background: #FEE2E2;
        color: #DC2626;
        font-weight: 600;
        border-radius: 6px;
      }
      .notes { margin-top: 20px; }
      .foot {
        margin-top: 32px;
        padding-top: 12px;
        border-top: 1px solid #E2E8F0;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        color: #64748B;
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <div class="head">
      <div>
        <div class="business">${escapeHtml(business?.business_name || 'GoatMat')}</div>
        ${contactLine ? `<div class="muted">${contactLine}</div>` : ''}
      </div>
      <div class="doc-type">
        ${isSale ? 'Bill' : 'Purchase record'}
        <div class="bill-no">#${bill.bill_no}</div>
        <div class="muted">${escapeHtml(prettyDate(bill.bill_date))}</div>
      </div>
    </div>

    ${bill.voided_at ? `<div class="voided">VOID — this bill does not count</div>` : ''}

    <div class="parties">
      <div>
        <div class="label">${isSale ? 'Billed to' : 'Bought from'}</div>
        <div class="party-name">${escapeHtml(bill.party?.name ?? '—')}</div>
        ${bill.party?.phone ? `<div class="muted">${escapeHtml(bill.party.phone)}</div>` : ''}
      </div>
      ${
        bill.supplier_ref
          ? `<div style="text-align:right">
               <div class="label">Supplier bill no.</div>
               <div>${escapeHtml(bill.supplier_ref)}</div>
             </div>`
          : ''
      }
    </div>

    <table>
      <thead>
        <tr>
          <th class="num" style="width:28px">#</th>
          <th>Item</th>
          <th class="num">Pieces</th>
          <th class="num">Rate</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr>
          <td class="muted">Total pieces</td>
          <td class="num">${totalPieces}</td>
        </tr>
        <tr>
          <td class="muted">Paid</td>
          <td class="num">${money(bill.paid_amount, { decimals: true })}</td>
        </tr>
        <tr>
          <td class="muted">${isSale ? 'Balance due' : 'Balance payable'}</td>
          <td class="num ${balance > 0 ? 'due' : 'settled'}">
            ${balance > 0 ? money(balance, { decimals: true }) : 'Settled'}
          </td>
        </tr>
        <tr class="grand">
          <td>Total</td>
          <td class="num">${money(bill.total_amount, { decimals: true })}</td>
        </tr>
      </table>
    </div>

    ${
      bill.notes
        ? `<div class="notes">
             <div class="label">Notes</div>
             <div>${escapeHtml(bill.notes)}</div>
           </div>`
        : ''
    }

    <div class="foot">
      <div>${escapeHtml(business?.bill_footer || 'Thank you for your business.')}</div>
      <div>${escapeHtml(business?.owner_name ?? '')}</div>
    </div>
  </body>
</html>`;
}

/**
 * Renders the bill to a PDF and opens the system share sheet, from which the
 * user picks WhatsApp (or anything else). The app never sends anything itself.
 */
export async function shareBillPdf(args: {
  kind: 'sale' | 'purchase';
  bill: BillDetail;
  business: Profile | null;
}): Promise<void> {
  // The file expo-print produces cannot be handed to the share sheet, and
  // cannot even be read back to copy it -- it lands in a scoped cache
  // directory the app has no read permission for. So the PDF comes back as
  // base64 and this writes it into the document directory itself, which is
  // both writable and shareable. Nothing ever reads the print output.
  const { base64 } = await Print.printToFileAsync({
    html: buildBillHtml(args),
    base64: true,
  });

  if (!base64) throw new Error('The PDF came back empty.');

  const target = new File(Paths.document, fileNameFor(args.kind, args.bill));
  if (target.exists) target.delete();
  target.create();
  target.write(base64ToBytes(base64));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/pdf',
    dialogTitle: args.kind === 'sale' ? 'Send bill' : 'Share purchase record',
    UTI: 'com.adobe.pdf',
  });
}
