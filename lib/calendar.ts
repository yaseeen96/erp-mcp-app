const TIMEZONE = "Asia/Kolkata";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const MONTH_PATTERN = "january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";
const WEEKDAY_LOOKUP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
const WEEKDAY_PATTERN = "sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thur|thurs|sun|mon|tue|wed|thu|fri|sat";

export const MAX_RANGE_DAYS = 62;

export const PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
] as const;

export type PeriodPreset = (typeof PERIODS)[number];
export type PeriodName = PeriodPreset | "day" | "month" | "custom" | "last_n_days";

export type DateFilter = {
  when?: string;
  date?: string;
  month?: string;
  period?: PeriodPreset;
  from?: string;
  to?: string;
};

export type ResolvedRange = {
  from: string;
  to: string;
  today: string;
  timezone: string;
  period: PeriodName;
  label: string;
};

export function parseIsoDate(value: string, field: string) {
  const date = value.trim().slice(0, 10);
  if (!ISO_DATE.test(date)) {
    throw new Error(`${field} must be YYYY-MM-DD, e.g. 2026-09-01.`);
  }
  return date;
}

export function addIsoDays(iso: string, amount: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return next.toISOString().slice(0, 10);
}

export function eachIsoDate(from: string, to: string, maxDays = MAX_RANGE_DAYS) {
  if (from > to) {
    throw new Error("from must be on or before to.");
  }
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addIsoDays(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > maxDays) {
      throw new Error(`Range cannot exceed ${maxDays} days. Ask for a day, week, or one month.`);
    }
  }
  return dates;
}

export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD calendar date. */
export function weekdayIndex(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 6, 30)).getUTCDay();
}

export function weekdayShort(iso: string) {
  return iso ? WEEKDAYS_SHORT[weekdayIndex(iso)] : "";
}

export function weekdayLong(iso: string) {
  return iso ? WEEKDAYS_LONG[weekdayIndex(iso)] : "";
}

export function mondayOfWeek(iso: string) {
  const dow = weekdayIndex(iso);
  const fromMonday = dow === 0 ? 6 : dow - 1;
  return addIsoDays(iso, -fromMonday);
}

export function sundayOfWeek(iso: string) {
  return addIsoDays(mondayOfWeek(iso), 6);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthRange(year: number, month: number, today: string): ResolvedRange {
  const from = `${year}-${pad2(month)}-01`;
  const end = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const { year: ty, month: tm } = parts(today);
  const isCurrent = year === ty && month === tm;
  const to = isCurrent && end > today ? today : end;
  const period: PeriodName = isCurrent ? "this_month" : "month";
  return finishRange({ from, to, today, period });
}

export function thisWeekRange(today = todayIso()) {
  const from = mondayOfWeek(today);
  const sunday = sundayOfWeek(today);
  return finishRange({
    from,
    to: today < sunday ? today : sunday,
    today,
    period: "this_week",
  });
}

export function lastWeekRange(today = todayIso()) {
  const thisMonday = mondayOfWeek(today);
  return finishRange({
    from: addIsoDays(thisMonday, -7),
    to: addIsoDays(thisMonday, -1),
    today,
    period: "last_week",
  });
}

export function thisMonthRange(today = todayIso()) {
  const { year, month } = parts(today);
  return monthRange(year, month, today);
}

export function lastMonthRange(today = todayIso()) {
  const { year, month } = parts(today);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return finishRange({
    from: `${prevYear}-${pad2(prevMonth)}-01`,
    to: `${prevYear}-${pad2(prevMonth)}-${pad2(daysInMonth(prevYear, prevMonth))}`,
    today,
    period: "last_month",
  });
}

export function calendarContext(today = todayIso()) {
  const { year, month } = parts(today);
  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  return {
    today,
    weekday: weekdayShort(today),
    weekdayLong: weekdayLong(today),
    weekStart: mondayOfWeek(today),
    weekEnd: sundayOfWeek(today),
    month: `${year}-${pad2(month)}`,
    monthStart,
    monthEnd,
    timezone: TIMEZONE,
  };
}

export function formatDateLabel(iso: string) {
  return iso ? `${weekdayShort(iso)} ${iso}` : "";
}

/** Voice-ready date, e.g. "Tuesday 8 September 2026". */
export function formatSpokenDate(iso: string) {
  if (!iso) {
    return "";
  }
  const { year, month, day } = parts(iso);
  return `${weekdayLong(iso)} ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

export function describeSpokenRange(range: ResolvedRange) {
  const from = formatSpokenDate(range.from);
  const to = formatSpokenDate(range.to);
  if (range.from === range.to) {
    if (range.period === "today") {
      return `Today ${from}.`;
    }
    if (range.period === "yesterday") {
      return `Yesterday ${from}.`;
    }
    return `${from}.`;
  }
  const span = `${from} to ${to}`;
  if (range.period === "this_week") {
    return `This week ${span}.`;
  }
  if (range.period === "last_week") {
    return `Last week ${span}.`;
  }
  if (range.period === "this_month") {
    return `This month ${span}.`;
  }
  if (range.period === "last_month" || range.period === "month") {
    const { year, month } = parts(range.from);
    return `${MONTH_NAMES[month - 1]} ${year}, ${span}.`;
  }
  return `${span}.`;
}

export function describeRange(range: ResolvedRange) {
  return `${range.label} (today ${formatDateLabel(range.today)}, ${range.timezone})`;
}

function rangeLabel(from: string, to: string, period: PeriodName) {
  if (from === to) {
    if (period === "today") {
      return `Today ${formatDateLabel(from)}`;
    }
    if (period === "yesterday") {
      return `Yesterday ${formatDateLabel(from)}`;
    }
    return formatDateLabel(from);
  }
  if (period === "this_week") {
    return `This week ${formatDateLabel(from)} to ${formatDateLabel(to)}`;
  }
  if (period === "last_week") {
    return `Last week ${formatDateLabel(from)} to ${formatDateLabel(to)}`;
  }
  if (period === "this_month") {
    return `This month ${formatDateLabel(from)} to ${formatDateLabel(to)}`;
  }
  if (period === "last_month" || period === "month") {
    const { year, month } = parts(from);
    return `${MONTH_NAMES[month - 1]} ${year} ${formatDateLabel(from)} to ${formatDateLabel(to)}`;
  }
  if (period === "last_n_days") {
    return `${formatDateLabel(from)} to ${formatDateLabel(to)}`;
  }
  return `${formatDateLabel(from)} to ${formatDateLabel(to)}`;
}

function finishRange(range: {
  from: string;
  to: string;
  today: string;
  period: PeriodName;
}): ResolvedRange {
  return {
    ...range,
    timezone: TIMEZONE,
    label: rangeLabel(range.from, range.to, range.period),
  };
}

function singleDay(iso: string, today: string, period: PeriodName = "day"): ResolvedRange {
  return finishRange({ from: iso, to: iso, today, period });
}

function mostRecentWeekday(targetDow: number, today: string, forcePrevious: boolean) {
  const todayDow = weekdayIndex(today);
  let delta = todayDow - targetDow;
  if (delta < 0) {
    delta += 7;
  }
  if (forcePrevious && delta === 0) {
    delta = 7;
  }
  return addIsoDays(today, -delta);
}

function recentMonth(month: number, today: string) {
  const { year, month: current } = parts(today);
  const yearForMonth = month > current ? year - 1 : year;
  return monthRange(yearForMonth, month, today);
}

function recentCalendarDate(month: number, day: number, today: string) {
  const { year } = parts(today);
  const last = daysInMonth(year, month);
  const thisYear = `${year}-${pad2(month)}-${pad2(Math.min(day, last))}`;
  if (thisYear <= today) {
    return thisYear;
  }
  const prevLast = daysInMonth(year - 1, month);
  return `${year - 1}-${pad2(month)}-${pad2(Math.min(day, prevLast))}`;
}

export function parseWhen(text: string, today = todayIso()): ResolvedRange {
  const raw = text.trim();
  if (!raw) {
    throw new Error("Pass a day, week, or month.");
  }

  const isoDate = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDate) {
    return singleDay(isoDate[1], today);
  }

  const isoMonth = raw.match(/\b(\d{4}-\d{2})\b/);
  if (isoMonth && ISO_MONTH.test(isoMonth[1])) {
    const [year, month] = isoMonth[1].split("-").map(Number);
    return monthRange(year, month, today);
  }

  const dmy = raw.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
      throw new Error(`Not a valid date: ${dmy[0]}. Use DD/MM/YYYY.`);
    }
    return singleDay(`${year}-${pad2(month)}-${pad2(day)}`, today);
  }

  const dm = raw.match(/\b(\d{1,2})[/.](\d{1,2})\b/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return singleDay(recentCalendarDate(month, day, today), today);
    }
  }

  const cleaned = raw
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(in|on|for|during|the|a|of|from)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^today$/.test(cleaned)) {
    return singleDay(today, today, "today");
  }
  if (/^yesterday$/.test(cleaned)) {
    return singleDay(addIsoDays(today, -1), today, "yesterday");
  }
  if (/\bthis week\b/.test(cleaned) || cleaned === "week") {
    return thisWeekRange(today);
  }
  if (/\blast week\b/.test(cleaned)) {
    return lastWeekRange(today);
  }
  if (/\bthis month\b/.test(cleaned) || cleaned === "month") {
    return thisMonthRange(today);
  }
  if (/\blast month\b/.test(cleaned)) {
    return lastMonthRange(today);
  }

  const lastDays = cleaned.match(/\b(?:last|past)\s+(\d{1,2})\s+days?\b/);
  if (lastDays) {
    const count = Number(lastDays[1]);
    if (count < 1 || count > MAX_RANGE_DAYS) {
      throw new Error(`Ask for 1–${MAX_RANGE_DAYS} days, or one month.`);
    }
    return finishRange({
      from: addIsoDays(today, -(count - 1)),
      to: today,
      today,
      period: "last_n_days",
    });
  }

  const lastWeekday = cleaned.match(new RegExp(`\\blast\\s+(${WEEKDAY_PATTERN})\\b`));
  if (lastWeekday) {
    const dow = WEEKDAY_LOOKUP[lastWeekday[1]];
    return singleDay(mostRecentWeekday(dow, today, true), today);
  }

  const thisWeekday = cleaned.match(new RegExp(`\\bthis\\s+(${WEEKDAY_PATTERN})\\b`));
  if (thisWeekday) {
    const dow = WEEKDAY_LOOKUP[thisWeekday[1]];
    const monday = mondayOfWeek(today);
    const date = addIsoDays(monday, dow === 0 ? 6 : dow - 1);
    return singleDay(date, today);
  }

  const dayMonth = cleaned.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`)
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = MONTH_LOOKUP[dayMonth[2]];
    const year = dayMonth[3] ? Number(dayMonth[3]) : undefined;
    const iso = year
      ? `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`
      : recentCalendarDate(month, day, today);
    return singleDay(iso, today);
  }

  const monthDay = cleaned.match(
    new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`)
  );
  if (monthDay) {
    const month = MONTH_LOOKUP[monthDay[1]];
    const day = Number(monthDay[2]);
    const year = monthDay[3] ? Number(monthDay[3]) : undefined;
    const iso = year
      ? `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`
      : recentCalendarDate(month, day, today);
    return singleDay(iso, today);
  }

  const monthOnly = cleaned.match(new RegExp(`\\b(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`));
  if (monthOnly) {
    const month = MONTH_LOOKUP[monthOnly[1]];
    if (monthOnly[2]) {
      return monthRange(Number(monthOnly[2]), month, today);
    }
    return recentMonth(month, today);
  }

  const weekdayOnly = cleaned.match(new RegExp(`^(${WEEKDAY_PATTERN})$`));
  if (weekdayOnly) {
    return singleDay(mostRecentWeekday(WEEKDAY_LOOKUP[weekdayOnly[1]], today, false), today);
  }

  throw new Error(
    `Could not read "${raw}" as a day, week, or month. Try today, yesterday, this week, last week, this month, August, 1 September, or 18/08/2026.`
  );
}

export function applyPeriod(period: PeriodPreset, today = todayIso()): ResolvedRange {
  if (period === "today") {
    return singleDay(today, today, "today");
  }
  if (period === "yesterday") {
    return singleDay(addIsoDays(today, -1), today, "yesterday");
  }
  if (period === "last_week") {
    return lastWeekRange(today);
  }
  if (period === "this_month") {
    return thisMonthRange(today);
  }
  if (period === "last_month") {
    return lastMonthRange(today);
  }
  return thisWeekRange(today);
}

export function hasDateFilter(args: DateFilter) {
  return Boolean(
    args.when?.trim() ||
      args.date?.trim() ||
      args.month?.trim() ||
      args.period ||
      args.from?.trim() ||
      args.to?.trim()
  );
}

export function resolveDateRange(
  args: DateFilter,
  options: { today?: string; fallback?: "this_week" | "none" } = {}
): ResolvedRange {
  const today = options.today ?? todayIso();
  const fromArg = args.from?.trim() ? parseIsoDate(args.from, "from") : "";
  const toArg = args.to?.trim() ? parseIsoDate(args.to, "to") : "";
  if (fromArg || toArg) {
    if (!fromArg || !toArg) {
      throw new Error("Pass both from and to for a custom range.");
    }
    return finishRange({ from: fromArg, to: toArg, today, period: "custom" });
  }
  if (args.date?.trim()) {
    return singleDay(parseIsoDate(args.date, "date"), today);
  }
  if (args.month?.trim()) {
    const month = args.month.trim();
    if (!ISO_MONTH.test(month)) {
      throw new Error("month must be YYYY-MM, e.g. 2026-08.");
    }
    const [year, monthNum] = month.split("-").map(Number);
    return monthRange(year, monthNum, today);
  }
  if (args.period) {
    return applyPeriod(args.period, today);
  }
  if (args.when?.trim()) {
    return parseWhen(args.when, today);
  }
  if (options.fallback === "none") {
    throw new Error("Pass when, date, month, period, or from and to.");
  }
  return thisWeekRange(today);
}

export function resolveSingleDate(args: { date?: string; when?: string }, today = todayIso()) {
  if (args.date?.trim()) {
    return parseIsoDate(args.date, "date");
  }
  if (args.when?.trim()) {
    const range = parseWhen(args.when, today);
    if (range.from !== range.to) {
      throw new Error(
        `"${args.when}" is ${range.label}. Use show_history or show_employee_history for more than one day.`
      );
    }
    return range.from;
  }
  return today;
}
