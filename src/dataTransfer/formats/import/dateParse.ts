/** Day/month order for numeric dates such as 03/04/2026. */
export type DayOrder = "us" | "eu";

export type Ymd = {y: number; m: number; d: number};

/** Result of reading a date/time cell: any part may be missing. offset = minutes east of UTC when given (Z, +02:00). */
export type DateTimeParts = {date: Ymd | null; time: number | null; offset: number | null};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const NUMERIC_DATE = /^(\d{1,2})([/.\-])(\d{1,2})\2(\d{4}|\d{2})$/;
const YEAR_FIRST_DATE = /^(\d{4})([/.\-])(\d{1,2})\2(\d{1,2})$/;

function daysInMonth(y: number, m: number): number {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function makeYmd(y: number, m: number, d: number): Ymd | null {
    if (!Number.isInteger(y) || y < 1900 || y > 2200) return null;
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return {y, m, d};
}

const fullYear = (year: string) => (year.length === 2 ? 2000 + Number(year) : Number(year));

/**
 * Reads a date: ISO / YYYY/MM/DD, numeric D/M/Y or M/D/Y (/ . - separators, 2- or 4-digit year)
 * using `order` (falling back to the other order when the preferred one is impossible, e.g. 25/03),
 * and month names ("Mar 4, 2026", "4 March 2026", "Wed, 4-Mar-26").
 */
export function parseDate(value: string, order: DayOrder): Ymd | null {
    const s = value.trim();
    if (!s) return null;
    let match = YEAR_FIRST_DATE.exec(s);
    if (match) return makeYmd(Number(match[1]), Number(match[3]), Number(match[4]));
    match = NUMERIC_DATE.exec(s);
    if (match) {
        const a = Number(match[1]);
        const b = Number(match[3]);
        const y = fullYear(match[4]);
        const preferred = order === "us" ? makeYmd(y, a, b) : makeYmd(y, b, a);
        return preferred ?? (order === "us" ? makeYmd(y, b, a) : makeYmd(y, a, b));
    }
    return parseMonthNameDate(s);
}

function parseMonthNameDate(s: string): Ymd | null {
    const tokens = s.toLowerCase().replace(/[,.]/g, " ").split(/[\s/\-]+/).filter(Boolean);
    let month: number | null = null;
    let day: number | null = null;
    let year: number | null = null;
    for (const token of tokens) {
        if (/^\d{4}$/.test(token)) {
            if (year !== null) return null;
            year = Number(token);
        } else if (/^\d{1,2}(st|nd|rd|th)?$/.test(token)) {
            const n = parseInt(token, 10);
            if (day === null) day = n;
            else if (year === null) year = 2000 + n;
            else return null;
        } else if (/^[a-z]+$/.test(token)) {
            const monthIndex = token.length >= 3 ? MONTHS.findIndex((name) => name.startsWith(token) || (token === "sept" && name === "september")) : -1;
            if (monthIndex >= 0 && month === null) month = monthIndex + 1;
            else if (token.length >= 3 && WEEKDAYS.some((name) => name.startsWith(token))) continue;
            else if (token === "of") continue;
            else return null;
        } else {
            return null;
        }
    }
    if (month === null || day === null || year === null) return null;
    return makeYmd(year, month, day);
}

/**
 * Reads a time of day as seconds since midnight: "14:05", "14:05:09", "14:05:09.123", "14h05",
 * "2:05 PM", "2:05:09 pm", "2 PM", "2:05 p.m.". "24:00" is accepted as end of day (86400).
 */
export function parseTime(value: string): number | null {
    const s = value.trim().toLowerCase();
    if (!s) return null;
    let match = /^(\d{1,2})(?:[:.h](\d{2}))?(?::(\d{2}))?(?:[.,]\d+)?\s*([ap])\.?\s?m\.?$/.exec(s);
    if (match) {
        const h = Number(match[1]);
        const m = Number(match[2] ?? 0);
        const sec = Number(match[3] ?? 0);
        if (h < 1 || h > 12 || m > 59 || sec > 59) return null;
        return ((h % 12) + (match[4] === "p" ? 12 : 0)) * 3600 + m * 60 + sec;
    }
    match = /^(\d{1,2})[:h](\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*h?$/.exec(s);
    if (match) {
        const h = Number(match[1]);
        const m = Number(match[2]);
        const sec = Number(match[3] ?? 0);
        if (h === 24 && m === 0 && sec === 0) return 86400;
        if (h > 23 || m > 59 || sec > 59) return null;
        return h * 3600 + m * 60 + sec;
    }
    return null;
}

const ISO_DATETIME = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(z|[+-]\d{2}(?::?\d{2})?)?$/i;
const TIME_PART = String.raw`(\d{1,2}(?:[:h]\d{2}(?::\d{2}(?:[.,]\d+)?)?)?\s*(?:[ap]\.?\s?m\.?)?)`;
const SPLIT_DATETIME = new RegExp(String.raw`^(.+?)(?:[\s,]+(?:at\s+)?|T)${TIME_PART}\s*(z|[+-]\d{2}(?::?\d{2})?)?$`, "i");

function parseOffset(value: string | undefined): number | null {
    if (!value) return null;
    if (value.toLowerCase() === "z") return 0;
    const match = /^([+-])(\d{2}):?(\d{2})?$/.exec(value);
    if (!match) return null;
    if (Number(match[2]) > 23 || Number(match[3] ?? 0) > 59) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
}

/**
 * Reads a cell that may hold a date, a time, or both. Returns null when nothing could be read.
 * A trailing Z / ±HH:MM offset is returned so the caller can honour it; otherwise values are local wall-clock.
 */
export function parseDateTime(value: string, order: DayOrder): DateTimeParts | null {
    const s = value.trim();
    if (!s) return null;
    const iso = ISO_DATETIME.exec(s);
    if (iso) {
        if (iso[7] && parseOffset(iso[7]) === null) return null;
        const date = makeYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
        if (!date) return null;
        let time: number | null = null;
        if (iso[4] !== undefined) {
            const h = Number(iso[4]);
            const m = Number(iso[5]);
            const sec = Number(iso[6] ?? 0);
            if (h > 24 || m > 59 || sec > 59 || (h === 24 && (m || sec))) return null;
            time = h * 3600 + m * 60 + sec;
        }
        return {date, time, offset: parseOffset(iso[7])};
    }
    const time = parseTime(s);
    if (time !== null) return {date: null, time, offset: null};
    const date = parseDate(s, order);
    if (date) return {date, time: null, offset: null};
    const split = SPLIT_DATETIME.exec(s);
    if (split) {
        if (split[3] && parseOffset(split[3]) === null) return null;
        const splitDate = parseDate(split[1].replace(/[\s,]+$/, ""), order);
        const splitTime = parseTime(split[2]);
        if (splitDate && splitTime !== null) return {date: splitDate, time: splitTime, offset: parseOffset(split[3])};
    }
    return null;
}

/** Unix seconds for a wall-clock date + seconds since midnight; local time unless an offset is given. dayShift adds calendar days. */
export function toUnix(date: Ymd, seconds: number, offset: number | null, dayShift = 0): number {
    const h = Math.floor(seconds / 3600);
    const mi = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (offset !== null) return Date.UTC(date.y, date.m - 1, date.d + dayShift, h, mi, s) / 1000 - offset * 60;
    return Math.round(new Date(date.y, date.m - 1, date.d + dayShift, h, mi, s).getTime() / 1000);
}

/** Leading numeric D/M or M/D date in a cell, used for column-level order inference. */
export function numericDateParts(value: string): {first: number; second: number; dot: boolean} | null {
    const match = /^\s*(\d{1,2})([/.\-])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/.exec(value);
    if (!match) return null;
    return {first: Number(match[1]), second: Number(match[3]), dot: match[2] === "."};
}

/**
 * Infers day/month order from all values of a column: any first part > 12 → EU, any second part > 12 → US.
 * Returns null when every value is ambiguous (or the column contradicts itself). `dot` reports DD.MM.YYYY style.
 */
export function inferDayOrder(values: string[]): {order: DayOrder | null; dot: boolean; seen: boolean} {
    let firstBig = false;
    let secondBig = false;
    let dot = false;
    let seen = false;
    for (const value of values) {
        const parts = numericDateParts(value);
        if (!parts) continue;
        seen = true;
        if (parts.first > 12) firstBig = true;
        if (parts.second > 12) secondBig = true;
        if (parts.dot) dot = true;
    }
    const order = firstBig && !secondBig ? "eu" : secondBig && !firstBig ? "us" : null;
    return {order, dot, seen};
}

export type DurationUnit = "hours" | "minutes" | "seconds";

const UNIT_SECONDS: Record<string, number> = {
    d: 86400, day: 86400, days: 86400,
    h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, std: 3600,
    m: 60, mn: 60, min: 60, mins: 60, minute: 60, minutes: 60,
    s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
};

function parseNumber(value: string): number | null {
    let s = value.trim();
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
    else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d*,\d+$/.test(s)) s = s.replace(",", ".");
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    return Number(s);
}

/**
 * Reads a duration in seconds: "1:30:00", "1:30" (H:MM), "1h 30m", "1h30", "90 min", "45s", "PT1H30M",
 * plain numbers in `unit` (decimal hours by default; "1,5" comma decimals accepted).
 */
export function parseDuration(value: string, unit: DurationUnit = "hours"): number | null {
    const s = value.trim().toLowerCase();
    if (!s) return null;
    let match = /^(\d+):(\d{1,2}):(\d{1,2})(?:[.,]\d+)?$/.exec(s);
    if (match) {
        if (Number(match[2]) > 59 || Number(match[3]) > 59) return null;
        return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
    match = /^(\d+):(\d{2})$/.exec(s);
    if (match) {
        if (Number(match[2]) > 59) return null;
        return Number(match[1]) * 3600 + Number(match[2]) * 60;
    }
    match = /^p(?:(\d+(?:\.\d+)?)d)?(?:t(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?)?$/.exec(s);
    if (match && s !== "p" && s !== "pt") {
        return Math.round(Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0));
    }
    const plain = parseNumber(s);
    if (plain !== null) return Math.round(plain * (unit === "seconds" ? 1 : unit === "minutes" ? 60 : 3600));

    // Unit tokens: "1h 30m", "1 hr 30 mins", "1h30", "2 hours, 5 minutes".
    const tokenRe = /(\d+(?:[.,]\d+)?)\s*([a-z]+)?[\s,]*/gy;
    let total = 0;
    let consumed = 0;
    let lastUnit = 0;
    let tokens = 0;
    while (consumed < s.length) {
        tokenRe.lastIndex = consumed;
        const token = tokenRe.exec(s);
        if (!token || token[0].length === 0) return null;
        const amount = Number(token[1].replace(",", "."));
        let factor: number | undefined;
        if (token[2]) {
            factor = UNIT_SECONDS[token[2]];
            if (factor === undefined) return null;
        } else {
            // Bare trailing number after a unit: "1h30" → minutes, "1m30" → seconds.
            if (!lastUnit || tokenRe.lastIndex < s.length) return null;
            factor = lastUnit === 3600 ? 60 : lastUnit === 60 ? 1 : undefined;
            if (factor === undefined) return null;
        }
        total += amount * factor;
        lastUnit = factor;
        consumed = tokenRe.lastIndex;
        tokens++;
    }
    return tokens ? Math.round(total) : null;
}
