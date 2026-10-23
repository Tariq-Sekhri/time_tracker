import type {DateFormat, TimeFormat} from "../../../types.ts";
import {formatDate, formatTime} from "../../shared.ts";

/*
 * jsPDF's built-in Helvetica only has glyphs for WinAnsi (Windows-1252). Anything outside that set
 * renders as garbage, so every user-provided string goes through pdfText() first.
 */

/** Characters Windows-1252 adds in 0x80-0x9F on top of Latin-1. */
const CP1252_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const REPLACEMENTS: Record<string, string> = {
    "→": "->",
    "←": "<-",
    "⇒": "=>",
    "↔": "<->",
    "≈": "~",
    "≤": "<=",
    "≥": ">=",
    "≠": "!=",
    "−": "-",
    "‐": "-",
    "‑": "-",
    "‒": "-",
    "―": "—",
    "′": "'",
    "″": '"',
    "Ł": "L",
    "ł": "l",
    "Đ": "D",
    "đ": "d",
    "ı": "i",
    "Ħ": "H",
    "ħ": "h",
    "ŀ": "l",
    "Ŀ": "L",
    " ": " ",
    " ": " ",
    " ": " ",
    " ": " ",
    " ": " ",
    "\t": " ",
};

/** Zero-width / joiner / variation-selector code points that should simply disappear. */
const INVISIBLE = /[​-‍⁠︀-️﻿]/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]/u;
const COMBINING = /\p{M}/gu;

function isWinAnsi(char: string): boolean {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x0a) return true;
    if (code >= 0x20 && code <= 0x7e) return true;
    if (code >= 0xa0 && code <= 0xff) return true;
    return CP1252_EXTRAS.has(char);
}

/**
 * Makes a string safe for jsPDF's standard fonts: keeps Windows-1252 characters, strips accents
 * from other Latin letters (ă → a), drops emoji and invisible characters, and replaces anything
 * else (CJK, Cyrillic, ...) with "?". Line breaks are kept; other control characters removed.
 */
export function pdfText(value: string | null | undefined): string {
    if (!value) return "";
    let out = "";
    for (const char of value.replace(/\r\n?/g, "\n")) {
        if (isWinAnsi(char)) {
            out += char;
            continue;
        }
        const replacement = REPLACEMENTS[char];
        if (replacement !== undefined) {
            out += replacement;
            continue;
        }
        if (INVISIBLE.test(char) || PICTOGRAPHIC.test(char)) continue;
        const code = char.codePointAt(0) ?? 0;
        if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
        const stripped = char.normalize("NFKD").replace(COMBINING, "");
        if (stripped && [...stripped].every(isWinAnsi)) {
            out += stripped;
            continue;
        }
        out += "?";
    }
    // Emoji removal can leave doubled spaces behind.
    return out.replace(/ {2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

/** Single-line version of pdfText (newlines become spaces). */
export function pdfLine(value: string | null | undefined): string {
    return pdfText(value).replace(/\s*\n\s*/g, " ");
}

/** "14:05" or "2:05 PM" — report tables drop the seconds that formatTime() includes. */
export function shortTime(timestamp: number, format: TimeFormat): string {
    return formatTime(timestamp, format).replace(/:\d{2}(?=( [AP]M)?$)/, "");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekdayShort(timestamp: number): string {
    return WEEKDAYS[new Date(timestamp * 1000).getDay()];
}

/** "Mar 4" — compact axis label. */
export function monthDay(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Mar 2026". */
export function monthYear(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Mar 4, 2026". */
export function longDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "Mon, 2026-03-02" in the user's date format. */
export function dayLabel(timestamp: number, format: DateFormat): string {
    return `${weekdayShort(timestamp)}, ${formatDate(timestamp, format)}`;
}

/** "34%", "<1%", "0%". */
export function percent(part: number, whole: number): string {
    if (whole <= 0 || part <= 0) return "0%";
    const value = (part / whole) * 100;
    if (value < 1) return "<1%";
    if (value > 99 && value < 100) return ">99%";
    return `${Math.round(value)}%`;
}
