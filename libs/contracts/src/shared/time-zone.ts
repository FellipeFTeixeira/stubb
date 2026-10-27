const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function offsetMinutes(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(ms);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name);
  if (!match) throw new RangeError(`Unsupported offset: ${name}`);
  if (!match[1]) return 0;
  const total = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -total : total;
}

/** `local` = `YYYY-MM-DDTHH:mm` (valor do `datetime-local`); devolve ISO UTC. */
export function zonedLocalToInstant(local: string, timeZone: string): string {
  const m = LOCAL_PATTERN.exec(local);
  if (!m) throw new RangeError(`Invalid local date-time: ${local}`);
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(guess);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    throw new RangeError(`Invalid local date-time: ${local}`);
  }
  const offset1 = offsetMinutes(guess, timeZone);
  let instant = guess - offset1 * 60000;
  const offset2 = offsetMinutes(instant, timeZone);
  if (offset2 !== offset1) instant = guess - offset2 * 60000;
  return new Date(instant).toISOString();
}

export function zonedParts(instant: string, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export function instantToZonedLocal(instant: string, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number, size = 2): string => String(n).padStart(size, '0');
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
