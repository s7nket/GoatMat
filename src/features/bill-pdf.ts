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

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + ' ' + ONES[n % 10]).trim();
}

/**
 * Amount in words, in the lakh/crore grouping every Indian bill uses. Customers
 * expect it, and it is what stops a figure being altered after the fact.
 */
function rupeesInWords(value: number): string {
  const total = Math.round(Math.abs(value));
  if (total === 0) return 'Zero Rupees Only';

  const parts: string[] = [];
  const crore = Math.floor(total / 1_00_00_000);
  const lakh = Math.floor((total % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((total % 1_00_000) / 1000);
  const hundred = Math.floor((total % 1000) / 100);
  const rest = total % 100;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  return `${parts.join(' ')} Rupees Only`;
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
  const fromAdvance = bill.payment_mode === 'advance';
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
      /* The page margin belongs here, not on the body. Giving the body an
         explicit mm width inside a page that is already A4 makes the renderer
         scale the whole document down to fit -- which is what made the text
         small and left the page half empty. */
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #0F1720;
        font-size: 15px;
        line-height: 1.55;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid #137A4C;
      }
      .business { font-size: 26px; font-weight: 700; color: #0A3D26; letter-spacing: -0.4px; }
      .muted { color: #64748B; font-size: 13px; }
      .doc-type {
        text-align: right;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #64748B;
      }
      .bill-no { font-size: 22px; font-weight: 700; color: #0F1720; }
      .parties { display: flex; justify-content: space-between; gap: 24px; margin: 20px 0 16px; }
      .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #94A3B8;
        margin-bottom: 2px;
      }
      .party-name { font-weight: 600; font-size: 17px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      thead th {
        text-align: left;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #64748B;
        border-bottom: 1.5px solid #94A3B8;
        padding: 10px 8px;
      }
      tbody td { padding: 12px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
      .num { text-align: right; white-space: nowrap; }
      thead th.num { text-align: right; }
      .name { font-weight: 500; }
      .strong { font-weight: 600; }
      .totals { margin-top: 20px; display: flex; justify-content: flex-end; }
      .totals table { width: 320px; }
      .totals td { padding: 7px 0; border: none; font-size: 15px; }
      .totals .grand td {
        border-top: 1.5px solid #94A3B8;
        border-bottom: 1.5px solid #94A3B8;
        padding: 12px 0;
        font-size: 20px;
        font-weight: 700;
      }
      .due { color: #DC2626; font-weight: 700; }
      .settled { color: #137A4C; font-weight: 700; }
      .voided {
        margin: 16px 0;
        padding: 10px 12px;
        background: #FEE2E2;
        color: #DC2626;
        font-weight: 600;
        border-radius: 6px;
      }
      .words {
        margin-top: 18px;
        padding: 12px 14px;
        background: #F1F5F9;
        border-radius: 4px;
      }
      .notes { margin-top: 18px; }
      .foot {
        margin-top: 48px;
        padding-top: 16px;
        border-top: 1px solid #E2E8F0;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 24px;
        color: #64748B;
        font-size: 13px;
      }
      .sign {
        text-align: center;
        min-width: 200px;
        padding-top: 44px;
        border-top: 1px solid #94A3B8;
        color: #0F1720;
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
        ${isSale ? 'Invoice' : 'Purchase record'}
        <div class="bill-no">No. ${bill.bill_no}</div>
        <div class="muted">${escapeHtml(prettyDate(bill.bill_date))}</div>
      </div>
    </div>

    ${bill.voided_at ? `<div class="voided">VOID — this bill does not count</div>` : ''}

    <div class="parties">
      <div>
        <div class="label">${isSale ? 'Billed to' : 'Bought from'}</div>
        <div class="party-name">${escapeHtml(bill.party?.name ?? '—')}</div>
        ${bill.party?.phone ? `<div class="muted">${escapeHtml(bill.party.phone)}</div>` : ''}
        ${bill.party?.address ? `<div class="muted">${escapeHtml(bill.party.address)}</div>` : ''}
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
        <tr class="grand">
          <td>Total</td>
          <td class="num">${money(bill.total_amount, { decimals: true })}</td>
        </tr>
        <tr>
          <td class="muted">Paid</td>
          <td class="num">${
            fromAdvance
              ? money(bill.total_amount, { decimals: true })
              : money(bill.paid_amount, { decimals: true })
          }</td>
        </tr>
        <tr>
          <td class="muted">${isSale ? 'Balance due' : 'Balance payable'}</td>
          <td class="num ${balance > 0 && !fromAdvance ? 'due' : 'settled'}">
            ${
              // Nothing was paid against this bill, but the customer had
              // already paid -- printing "due" would ask them for money twice.
              fromAdvance
                ? 'Paid in advance'
                : balance > 0
                  ? money(balance, { decimals: true })
                  : 'Settled'
            }
          </td>
        </tr>
      </table>
    </div>

    <div class="words">
      <span class="label">Amount in words</span>
      <div class="strong">${escapeHtml(rupeesInWords(Number(bill.total_amount)))}</div>
    </div>

    ${
      bill.reference
        ? `<div class="notes">
             <div class="label">${
               bill.payment_mode === 'upi' ? 'UPI reference (UTR)' : 'Transaction reference'
             }</div>
             <div class="strong">${escapeHtml(bill.reference)}</div>
           </div>`
        : ''
    }

    ${
      bill.notes
        ? `<div class="notes">
             <div class="label">Note</div>
             <div>${escapeHtml(bill.notes)}</div>
           </div>`
        : ''
    }

    <div class="foot">
      <div>${escapeHtml(business?.bill_footer || 'Thank you for your business.')}</div>
      <div class="sign">
        For ${escapeHtml(business?.business_name || 'GoatMat')}
      </div>
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
    // A4 in points (72dpi): 210mm x 297mm. Without this the page is US Letter,
    // which is what every printer and phone in India is not set up for.
    width: 595,
    height: 842,
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
