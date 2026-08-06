/**
 * Formatting helpers. Money and dates get touched on nearly every screen, so
 * they live in one place and are hand-rolled rather than leaning on `Intl`
 * (Hermes ships an Intl subset whose behaviour varies by Android version --
 * a bill total is not worth that risk).
 */

/** Indian digit grouping: 1234567 -> "12,34,567" */
function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

type MoneyOptions = {
  /** Show the rupee sign. Default true. */
  symbol?: boolean;
  /** Always show .00. Default false -- whole rupees stay clean. */
  decimals?: boolean;
};

export function money(value: number | string | null | undefined, options: MoneyOptions = {}): string {
  const { symbol = true, decimals = false } = options;
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return symbol ? '₹0' : '0';

  const negative = n < 0;
  const abs = Math.abs(n);
  const rounded = abs.toFixed(2);
  const [whole, frac] = rounded.split('.');

  let out = groupIndian(whole);
  if (decimals || frac !== '00') out += '.' + frac;
  if (symbol) out = '₹' + out;
  if (negative) out = '-' + out;
  return out;
}

/** Compact form for dashboard tiles: 125000 -> "₹1.25L" */
export function moneyShort(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return money(n);
}

export function pieces(qty: number | null | undefined): string {
  const n = Number(qty ?? 0);
  return `${groupIndian(String(Math.abs(n)))} ${Math.abs(n) === 1 ? 'pc' : 'pcs'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-08-06' -> '6 Aug 2026'. Accepts a Date or an ISO date string. */
export function prettyDate(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? parseISODate(input) : input;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** '6 Aug' -- for dense list rows where the year is obvious. */
export function shortDate(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? parseISODate(input) : input;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * Parse 'YYYY-MM-DD' as a *local* date.
 * `new Date('2026-08-06')` parses as UTC and can render as the 5th in IST --
 * an off-by-one-day bug on every bill. Hence the explicit construction.
 */
export function parseISODate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Date -> 'YYYY-MM-DD' in local time, the format Postgres `date` columns take. */
export function toISODate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
