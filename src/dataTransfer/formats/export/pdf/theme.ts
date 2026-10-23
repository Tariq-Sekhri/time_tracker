/** RGB triple, 0-255. */
export type Rgb = [number, number, number];

export const DEFAULT_ACCENT = "#2563eb";

/** Parses #rgb / #rrggbb (with or without #). Returns null for anything else. */
export function parseHex(value: string | null | undefined): Rgb | null {
    if (!value) return null;
    let hex = value.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split("").map(c => c + c).join("");
    if (/^[0-9a-f]{8}$/i.test(hex)) hex = hex.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** Linear mix: amount 0 = a, 1 = b. */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
    return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * amount)) as Rgb;
}

export const tint = (color: Rgb, amount: number): Rgb => mix(color, WHITE, amount);
export const shade = (color: Rgb, amount: number): Rgb => mix(color, BLACK, amount);

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
    const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export const WHITE: Rgb = [255, 255, 255];
export const BLACK: Rgb = [0, 0, 0];

/** Neutral ink and surface tokens (cool grays). */
export const INK = {
    primary: [17, 24, 39] as Rgb,
    secondary: [75, 85, 99] as Rgb,
    muted: [128, 136, 150] as Rgb,
    faint: [170, 176, 188] as Rgb,
};
export const SURFACE = {
    tile: [246, 247, 249] as Rgb,
    track: [238, 240, 243] as Rgb,
    zebra: [250, 251, 252] as Rgb,
    hairline: [226, 229, 234] as Rgb,
    grid: [234, 236, 240] as Rgb,
    weekend: [248, 249, 251] as Rgb,
};
/** Gray used for the "Other" bucket and uncolored categories. */
export const OTHER_GRAY: Rgb = [176, 182, 192];

/** Validated categorical order (blue, orange, aqua, yellow, magenta, green, violet, red). */
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"].map(
    hex => parseHex(hex)!,
);

export type Theme = {
    accent: Rgb;
    /** Very light accent wash for table headers / group rows. */
    accentWash: Rgb;
    accentSoft: Rgb;
    /** Accent darkened enough to be used as text on white and on the wash. */
    accentInk: Rgb;
    /** Second series color for stacked charts (activity on top of manual). */
    secondary: Rgb;
    /** Fallback colors for categories without their own: accent first, then the categorical order. */
    palette: Rgb[];
};

export function makeTheme(accentHex: string | null | undefined): Theme {
    const accent = parseHex(accentHex) ?? parseHex(DEFAULT_ACCENT)!;
    // Keep very light accents readable as text.
    let accentInk = accent;
    for (let step = 0; step < 8 && luminance(accentInk) > 0.18; step++) accentInk = shade(accentInk, 0.15);
    const palette = [accent, ...CATEGORICAL.filter(color => distance(color, accent) > 60)];
    return {
        accent,
        accentWash: tint(accent, 0.92),
        accentSoft: tint(accent, 0.8),
        accentInk,
        secondary: tint(accent, 0.55),
        palette,
    };
}

function distance(a: Rgb, b: Rgb): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
