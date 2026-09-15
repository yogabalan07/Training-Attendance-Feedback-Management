export function asString(value: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function asOptionalString(value: string | string[] | undefined): string | undefined {
  const s = asString(value);
  return s.length > 0 ? s : undefined;
}

export function asInt(value: string | string[] | undefined, fallback: number): number {
  const s = asString(value);
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? fallback : n;
}

export function asBool(value: string | string[] | undefined, fallback = false): boolean {
  const s = asString(value).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return fallback;
}