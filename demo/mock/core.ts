import {
    DEMO_DEFAULT_CATEGORIES,
    DEMO_DEFAULT_CAT_REGEX,
    DEMO_DEFAULT_SKIPPED_REGEXES,
} from "./defaultSeedData";
import {
    realisticBrowserNonVideo,
    realisticCodingWindow,
    realisticDiscordLine,
    realisticGameWindow,
    realisticLearningTitle,
    realisticMeetTitle,
    realisticMusicTitle,
    realisticReadingTitle,
    realisticSlackLine,
    realisticWatchingPair,
    realisticYoutubeTab,
    realisticZoomTitle,
} from "./realisticAppTitles";

type TimeBlockRow = {
    id: number;
    category: string;
    start_time: number;
    end_time: number;
    apps: { app: string; total_duration: number }[];
    appLogIds: number[];
};

type RawLog = {
    id: number;
    app: string;
    timestamp: number;
    duration: number;
};

type MergedRow = {
    ids: number[];
    app: string;
    timestamp: number;
    duration: number;
    category: string;
};

type CategoryRow = {
    id: number;
    name: string;
    priority: number;
    color: string | null;
};

type RegexRow = {
    id: number;
    cat_id: number;
    regex: string;
};

type SkippedRow = {
    id: number;
    regex: string;
};

type GoogleCal = {
    id: number;
    google_calendar_id: string;
    name: string;
    color: string;
    account_email: string;
};

type GoogleEv = {
    calendar_id: number;
    event_id: string;
    title: string;
    start: number;
    end: number;
    description?: string;
    location?: string;
};

type DemoGoogleCalendarCatalogRow = {
    google_calendar_id: string;
    name: string;
    color: string;
    access_role: string;
};

const DEMO_GOOGLE_CALENDAR_CATALOG: DemoGoogleCalendarCatalogRow[] = [
    {
        google_calendar_id: "cal_family_time",
        name: "Family time",
        color: "#0B8043",
        access_role: "owner",
    },
    {
        google_calendar_id: "cal_friends",
        name: "Friends",
        color: "#7986CB",
        access_role: "writer",
    },
    {
        google_calendar_id: "cal_sleep",
        name: "Sleep",
        color: "#673AB7",
        access_role: "reader",
    },
    {
        google_calendar_id: "cal_work",
        name: "Work",
        color: "#039BE5",
        access_role: "owner",
    },
    {
        google_calendar_id: "cal_holidays",
        name: "Holidays",
        color: "#F4511E",
        access_role: "reader",
    },
];

const DEMO_CLIENT_ID = "123456789-demo.apps.googleusercontent.com";
const DEMO_CLIENT_SECRET = "GOCSPX-abcdefghijklmnopqrstuvwxyz";

let seeded = false;
let tracking = true;
let calendarPrefsJson: string | null = null;
let googleLoggedIn = true;
let nextCatId = 100;
let nextRegexId = 100;
let nextSkipId = 100;
let nextGCalId = 100;
let nextEventSeq = 1;

let categories: CategoryRow[] = [];
let catRegex: RegexRow[] = [];
let rawLogs: RawLog[] = [];
let mergedLogs: MergedRow[] = [];
let timeBlocks: TimeBlockRow[] = [];
let skippedApps: SkippedRow[] = [];
let googleCalendars: GoogleCal[] = [];
let googleEvents: GoogleEv[] = [];

let oauthClientId = DEMO_CLIENT_ID;
let oauthClientSecret = DEMO_CLIENT_SECRET;

const defaultSkipped: SkippedRow[] = DEMO_DEFAULT_SKIPPED_REGEXES.map((regex, i) => ({
    id: i + 1,
    regex,
}));

const DEMO_CALENDAR_START_HOUR = 6;

function getWeekRangeSeconds(
    date: Date,
    calendarStartHour: number
): { week_start: number; week_end: number } {
    const h = Number.isFinite(calendarStartHour)
        ? Math.min(23, Math.max(0, Math.floor(calendarStartHour)))
        : DEMO_CALENDAR_START_HOUR;
    const y = date.getFullYear();
    const m = date.getMonth();
    const day = date.getDate();
    const dow = date.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const mondayCal = new Date(y, m, day + offsetToMonday, 0, 0, 0, 0);
    const weekStart = new Date(mondayCal);
    weekStart.setHours(h, 0, 0, 0);
    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setDate(weekEndExclusive.getDate() + 7);
    const week_end = Math.floor(weekEndExclusive.getTime() / 1000) - 1;
    return {
        week_start: Math.floor(weekStart.getTime() / 1000),
        week_end,
    };
}

function getLocalDayStartSec(timestampSec: number): number {
    const d = new Date(timestampSec * 1000);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}

function mondayBasedDayIndex(timestampSec: number): number {
    const d = new Date(timestampSec * 1000);
    const js = d.getDay();
    return js === 0 ? 6 : js - 1;
}

function getHourLocal(timestampSec: number): number {
    return new Date(timestampSec * 1000).getHours();
}

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function jitter(base: number, spread: number): number {
    return Math.max(60, base + randInt(-spread, spread));
}

function sumApps(tb: TimeBlockRow): number {
    return tb.apps.reduce((s, a) => s + a.total_duration, 0);
}

function overlapSec(block: TimeBlockRow, rangeStart: number, rangeEnd: number): number {
    const s = Math.max(block.start_time, rangeStart);
    const e = Math.min(block.end_time, rangeEnd);
    return Math.max(0, e - s);
}

function isAppSkippedByRules(appName: string): boolean {
    for (const s of skippedApps) {
        try {
            if (new RegExp(s.regex).test(appName)) return true;
        } catch {
            /* invalid regex */
        }
    }
    return false;
}

type CachedDemoRegex = { re: RegExp; category: string; priority: number };

function buildCachedDemoRegexTable(): CachedDemoRegex[] {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const out: CachedDemoRegex[] = [];
    for (const row of catRegex) {
        const cat = catById.get(row.cat_id);
        if (!cat) continue;
        try {
            out.push({ re: new RegExp(row.regex), category: cat.name, priority: cat.priority });
        } catch {
        }
    }
    out.sort((a, b) => b.priority - a.priority);
    return out;
}

function deriveDemoCategoryForApp(app: string): string {
    const table = buildCachedDemoRegexTable();
    for (const entry of table) {
        if (entry.re.test(app)) return entry.category;
    }
    return "Miscellaneous";
}

function syncDemoCategoriesFromRegexRules() {
    mergedLogs = mergedLogs.map((m) => ({ ...m, category: deriveDemoCategoryForApp(m.app) }));
    timeBlocks = timeBlocks.map((tb) => {
        const weights = new Map<string, number>();
        for (const a of tb.apps) {
            const c = deriveDemoCategoryForApp(a.app);
            weights.set(c, (weights.get(c) ?? 0) + a.total_duration);
        }
        let best = tb.category;
        let bestW = -1;
        for (const [c, w] of weights) {
            if (w > bestW) {
                bestW = w;
                best = c;
            }
        }
        return { ...tb, category: best };
    });
}

function filterSkippedAppsFromBlock(b: TimeBlockRow): TimeBlockRow | null {
    const apps: { app: string; total_duration: number }[] = [];
    const appLogIds: number[] = [];
    for (let i = 0; i < b.apps.length; i++) {
        if (!isAppSkippedByRules(b.apps[i].app)) {
            apps.push(b.apps[i]);
            appLogIds.push(b.appLogIds[i]);
        }
    }
    if (apps.length === 0) return null;
    const span = Math.max(...apps.map((a) => a.total_duration), 0);
    return {
        ...b,
        apps,
        appLogIds,
        end_time: b.start_time + span,
    };
}

function removeLogIdsFromOneBlock(b: TimeBlockRow, ids: Set<number>): TimeBlockRow | null {
    const keep: number[] = [];
    for (let i = 0; i < b.appLogIds.length; i++) {
        if (!ids.has(b.appLogIds[i])) keep.push(i);
    }
    if (keep.length === 0) return null;
    if (keep.length === b.apps.length) return b;
    const apps = keep.map((i) => b.apps[i]);
    const appLogIds = keep.map((i) => b.appLogIds[i]);
    const span = Math.max(...apps.map((a) => a.total_duration), 0);
    return {
        ...b,
        apps,
        appLogIds,
        end_time: b.start_time + span,
    };
}

function removeLogIdsFromBlocks(ids: Set<number>) {
    if (ids.size === 0) return;
    timeBlocks = timeBlocks
        .map((b) => removeLogIdsFromOneBlock(b, ids))
        .filter((b): b is TimeBlockRow => b !== null);
}

function blocksInRangeEffective(ws: number, we: number): TimeBlockRow[] {
    return timeBlocks
        .filter((b) => b.end_time > ws && b.start_time < we)
        .map((b) => filterSkippedAppsFromBlock(b))
        .filter((b): b is TimeBlockRow => b !== null);
}

function seed() {
    if (seeded) return;
    seeded = true;

    const day = 86400;
    const week = 7 * day;
    const h = DEMO_CALENDAR_START_HOUR;

    categories = DEMO_DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    catRegex = DEMO_DEFAULT_CAT_REGEX.map((r) => ({ ...r }));
    nextCatId = Math.max(0, ...categories.map((c) => c.id)) + 1;
    nextRegexId = Math.max(0, ...catRegex.map((r) => r.id)) + 1;

    skippedApps = defaultSkipped.map((s) => ({ ...s }));

    let bid = 1;
    let lid = 1;
    const blocks: TimeBlockRow[] = [];
    const mergeRows: MergedRow[] = [];
    const raws: RawLog[] = [];

    const mkBlock = (
        category: string,
        start: number,
        end: number,
        apps: [string, number][]
    ) => {
        const appsRows: { app: string; total_duration: number }[] = [];
        const appLogIds: number[] = [];
        for (const [app, dur] of apps) {
            const ts = start;
            appsRows.push({ app, total_duration: dur });
            appLogIds.push(lid);
            raws.push({ id: lid, app, timestamp: ts, duration: dur });
            mergeRows.push({
                ids: [lid],
                app,
                timestamp: ts,
                duration: dur,
                category,
            });
            lid++;
        }
        blocks.push({
            id: bid++,
            category,
            start_time: start,
            end_time: end,
            apps: appsRows,
            appLogIds,
        });
    };

    const snapApps = (span: number, apps: [string, number][]): [string, number][] => {
        const sum = apps.reduce((a, [, d]) => a + d, 0);
        if (sum <= 0) {
            const each = Math.max(60, Math.floor(span / Math.max(1, apps.length)));
            return apps.map(([a]) => [a, each]);
        }
        const k = span / sum;
        return apps.map(([a, d]) => [a, Math.max(60, Math.floor(d * k))] as [string, number]);
    };

    const nowSec = Math.floor(Date.now() / 1000);

    const regexTitle = (regex: string) => {
        if (regex.startsWith("^Rocket")) return "Rocket League (64-bit, DX11, Cooked)";
        return regex;
    };

    const codingAppPool = DEMO_DEFAULT_CAT_REGEX.filter((r) => r.cat_id === 6).map((r) =>
        regexTitle(r.regex)
    );
    const gamingAppPool = DEMO_DEFAULT_CAT_REGEX.filter((r) => r.cat_id === 7).map((r) =>
        regexTitle(r.regex)
    );

    const pickCodingPair = (): [string, string] => {
        if (codingAppPool.length === 0) return ["Cursor", "Visual Studio Code"];
        const a = codingAppPool[randInt(0, codingAppPool.length - 1)];
        let b = codingAppPool[randInt(0, codingAppPool.length - 1)];
        for (let k = 0; k < 50 && b === a && codingAppPool.length > 1; k++) {
            b = codingAppPool[randInt(0, codingAppPool.length - 1)];
        }
        return [a, b];
    };

    const pickTwoGames = (): [string, string] => {
        if (gamingAppPool.length === 0) return ["Steam", "Minecraft"];
        if (gamingAppPool.length === 1) {
            const g = gamingAppPool[0];
            return [g, g];
        }
        const i = randInt(0, gamingAppPool.length - 1);
        let j = randInt(0, gamingAppPool.length - 1);
        for (let k = 0; k < 50 && j === i; k++) {
            j = randInt(0, gamingAppPool.length - 1);
        }
        if (j === i) j = (i + 1) % gamingAppPool.length;
        return [gamingAppPool[i], gamingAppPool[j]];
    };

    const makeDayBounds = (anchorUnix: number) => {
        const mid = getLocalDayStartSec(anchorUnix);
        const dayWake = mid + 7 * 3600 + randInt(-3600, 3600);
        const daySleep = mid + day + 1 * 3600 + randInt(-3600, 3600);
        return { mid, dayWake, daySleep };
    };

    const boundsByAnchor = new Map<
        number,
        { mid: number; dayWake: number; daySleep: number }
    >();

    const dayBoundsAt = (anchorUnix: number) => {
        let b = boundsByAnchor.get(anchorUnix);
        if (!b) {
            b = makeDayBounds(anchorUnix);
            boundsByAnchor.set(anchorUnix, b);
        }
        return b;
    };

    const mkAwake = (
        dayWake: number,
        daySleep: number,
        category: string,
        start: number,
        end: number,
        apps: [string, number][]
    ) => {
        let s = Math.max(start, dayWake);
        let e = Math.min(end, daySleep);
        e = Math.min(e, nowSec);
        if (s >= nowSec) return;
        if (e <= s) return;
        const span = Math.max(60, e - s);
        mkBlock(category, s, e, snapApps(span, apps));
    };

    const ref = new Date();
    const { week_start: anchorWeekStart } = getWeekRangeSeconds(ref, h);

    googleEvents = [];

    const familySlots = [
        { d: 0, startMin: 17 * 60, durMin: 45 },
        { d: 2, startMin: 12 * 60 + 30, durMin: 50 },
        { d: 4, startMin: 18 * 60 + 15, durMin: 40 },
    ];
    const friendsSlots = [
        { d: 1, startMin: 17 * 60 + 45, durMin: 40 },
        { d: 5, startMin: 14 * 60 + 30, durMin: 75 },
    ];
    const familyTitles = ["Family dinner", "Lunch with family", "Family outing"];
    const friendsTitles = ["Coffee with friends", "Hangout", "Movie night"];

    for (let w = -2; w <= 2; w++) {
        const ws = anchorWeekStart + w * week;
        const { week_end: we } = getWeekRangeSeconds(new Date(ws * 1000), h);
        boundsByAnchor.clear();

        const pushEv = (e: GoogleEv) => {
            if (e.start >= nowSec) return;
            const end = Math.min(e.end, nowSec);
            if (end <= e.start + 60) return;
            googleEvents.push({ ...e, end });
        };

        for (let fi = 0; fi < familySlots.length; fi++) {
            const sl = familySlots[fi];
            const anchor = ws + sl.d * day;
            const { mid, dayWake, daySleep } = dayBoundsAt(anchor);
            let t0 = mid + sl.startMin * 60 + randInt(-420, 420);
            t0 = Math.min(Math.max(t0, dayWake), daySleep - 120);
            const t1 = Math.min(t0 + sl.durMin * 60 + randInt(-90, 90), daySleep);
            if (t1 > t0 + 60) {
                pushEv({
                    calendar_id: 1,
                    event_id: `w${w}_fam_${fi}`,
                    title: familyTitles[fi % familyTitles.length],
                    start: t0,
                    end: t1,
                });
            }
        }
        for (let fr = 0; fr < friendsSlots.length; fr++) {
            const sl = friendsSlots[fr];
            const anchor = ws + sl.d * day;
            const { mid, dayWake, daySleep } = dayBoundsAt(anchor);
            let t0 = mid + sl.startMin * 60 + randInt(-420, 420);
            t0 = Math.min(Math.max(t0, dayWake), daySleep - 120);
            const t1 = Math.min(t0 + sl.durMin * 60 + randInt(-90, 90), daySleep);
            if (t1 > t0 + 60) {
                pushEv({
                    calendar_id: 2,
                    event_id: `w${w}_fr_${fr}`,
                    title: friendsTitles[fr % friendsTitles.length],
                    start: t0,
                    end: t1,
                });
            }
        }

        for (let d = 0; d < 7; d++) {
            const anchor = ws + d * day;
            const mid = getLocalDayStartSec(anchor);
            const sj = randInt(-3600, 3600);
            const wj = randInt(-3600, 3600);
            let sleepStart = mid + day + 1 * 3600 + sj;
            let sleepEnd = mid + day + 7 * 3600 + wj;
            if (sleepEnd < sleepStart + 3 * 3600) {
                sleepEnd = sleepStart + 5 * 3600;
            }
            if (sleepEnd <= we + 1) {
                pushEv({
                    calendar_id: 3,
                    event_id: `w${w}_d${d}_sleep`,
                    title: "Sleep",
                    start: sleepStart,
                    end: sleepEnd,
                });
            }
        }

        for (let d = 0; d < 7; d++) {
            const anchor = ws + d * day;
            const { dayWake, daySleep } = dayBoundsAt(anchor);
            const isWeekend = d >= 5;

            const preSleepBuf = randInt(14 * 60, 38 * 60);
            const tailEnd = daySleep - preSleepBuf;
            const watchDurSec = randInt(3600, 3 * 3600);
            const preWatchBuf = randInt(22 * 60, 58 * 60);
            let watchEnd = tailEnd;
            let watchStart = watchEnd - watchDurSec;
            let dayPartEnd = watchStart - preWatchBuf;

            if (dayPartEnd < dayWake + 3 * 3600) {
                dayPartEnd = dayWake + Math.floor((tailEnd - dayWake) * 0.45);
                watchStart = dayPartEnd + preWatchBuf;
                watchEnd = Math.min(tailEnd, watchStart + Math.min(watchDurSec, tailEnd - watchStart));
            }

            const gameDurSec = jitter(randInt(3600, 10080), 520);
            let gameEnd = dayPartEnd - randInt(10 * 60, 28 * 60);
            let gameStart = gameEnd - gameDurSec;
            const minGameStart = dayWake + randInt(7, 10) * 3600;
            if (gameStart < minGameStart) {
                gameStart = minGameStart;
                gameEnd = Math.min(gameStart + gameDurSec, dayPartEnd - 8 * 60);
            }
            if (gameEnd - gameStart < 2400) {
                gameEnd = Math.min(gameStart + 5400, dayPartEnd - 5 * 60);
            }
            if (gameEnd > dayPartEnd - 60) {
                gameEnd = dayPartEnd - 60;
            }
            if (gameStart >= gameEnd - 600) {
                gameStart = Math.max(dayWake + 6 * 3600, gameEnd - 7200);
            }

            let fillEnd = gameStart - randInt(20 * 60, 55 * 60);
            if (fillEnd < dayWake + 45 * 60) {
                fillEnd = dayWake + 45 * 60;
            }
            if (fillEnd >= gameStart - 120) {
                fillEnd = Math.max(dayWake + 30 * 60, gameStart - 25 * 60);
            }

            let cursor = dayWake + randInt(0, 22 * 60);

            const placeFill = (dur0: number, category: string, apps: [string, number][]) => {
                if (cursor >= nowSec) return false;
                let dur = dur0;
                if (cursor + dur > fillEnd) {
                    dur = fillEnd - cursor;
                }
                if (dur < 900) return false;
                const e = cursor + dur;
                const span = dur;
                const scaled = snapApps(
                    span,
                    apps.map(([a, t]) => [a, t > 0 ? t : dur] as [string, number])
                );
                mkAwake(dayWake, daySleep, category, cursor, e, scaled);
                cursor = e;
                return true;
            };

            const placeCodingBig = () => {
                const dur = jitter(randInt(9000, 19800), 900);
                const [ta, tb] = pickCodingPair();
                const c1 = Math.max(600, Math.floor(dur * (0.34 + Math.random() * 0.28)));
                return placeFill(dur, "Coding", [
                    [realisticCodingWindow(randInt, ta), c1],
                    [realisticCodingWindow(randInt, tb), Math.max(600, dur - c1)],
                ]);
            };

            const placeBrowseBig = () => {
                const dur = jitter(randInt(5400, 14400), 720);
                const b1 = Math.max(400, Math.floor(dur * (0.4 + Math.random() * 0.22)));
                return placeFill(dur, "Browsing", [
                    [realisticYoutubeTab(randInt), b1],
                    [realisticBrowserNonVideo(randInt), dur - b1],
                ]);
            };

            const placeMeetBig = () => {
                const dur = jitter(randInt(4500, 10800), 600);
                const m = randInt(0, 2);
                const line =
                    m === 0
                        ? realisticMeetTitle(randInt)
                        : m === 1
                          ? realisticZoomTitle(randInt)
                          : realisticSlackLine(randInt);
                return placeFill(dur, "Social", [[line, dur]]);
            };

            const placeLearningBig = () => {
                const dur = jitter(randInt(7200, 16200), 800);
                return placeFill(dur, "Learning", [[realisticLearningTitle(randInt), dur]]);
            };

            const placeDiscordBig = () => {
                const dur = jitter(randInt(3600, 9000), 500);
                return placeFill(dur, "Social", [[realisticDiscordLine(randInt), dur]]);
            };

            const placeReadingBig = () => {
                const dur = jitter(randInt(3600, 10800), 550);
                return placeFill(dur, "Reading", [[realisticReadingTitle(randInt), dur]]);
            };

            const placeMusicBig = () => {
                const dur = jitter(randInt(3600, 9900), 500);
                return placeFill(dur, "Music", [[realisticMusicTitle(randInt), dur]]);
            };

            const placeSocialSplitBig = () => {
                const dur = jitter(randInt(5400, 11700), 650);
                const s1 = Math.max(500, Math.floor(dur * (0.48 + Math.random() * 0.12)));
                return placeFill(dur, "Social", [
                    [realisticDiscordLine(randInt), s1],
                    [realisticSlackLine(randInt), dur - s1],
                ]);
            };

            const runKind = (kind: string) => {
                if (kind === "coding") return placeCodingBig();
                if (kind === "browse") return placeBrowseBig();
                if (kind === "meet") return placeMeetBig();
                if (kind === "learning") return placeLearningBig();
                if (kind === "social") return placeDiscordBig();
                if (kind === "reading") return placeReadingBig();
                if (kind === "music") return placeMusicBig();
                if (kind === "split") return placeSocialSplitBig();
                return false;
            };

            const shuffleKinds = (xs: string[]) => {
                const a = [...xs];
                for (let i = a.length - 1; i > 0; i--) {
                    const j = randInt(0, i);
                    const t = a[i];
                    a[i] = a[j];
                    a[j] = t;
                }
                return a;
            };

            if (isWeekend) {
                const pool = shuffleKinds([
                    "browse",
                    "reading",
                    "music",
                    "social",
                    "coding",
                    "split",
                ]);
                const n = randInt(2, 3);
                for (let i = 0; i < n && cursor < fillEnd - 900 && cursor < nowSec; i++) {
                    if (!runKind(pool[i])) break;
                }
            } else {
                const pool = shuffleKinds(["coding", "meet", "browse", "learning", "social"]);
                const n = randInt(3, 4);
                for (let i = 0; i < n && cursor < fillEnd - 900 && cursor < nowSec; i++) {
                    if (!runKind(pool[i])) break;
                }
            }

            const slack = fillEnd - cursor;
            if (slack >= 1800 && cursor < nowSec) {
                if (randInt(0, 1) === 0) {
                    placeBrowseBig();
                } else {
                    placeCodingBig();
                }
            } else if (slack >= 900 && cursor < nowSec) {
                const y = Math.max(400, Math.floor(slack * (0.38 + Math.random() * 0.2)));
                placeFill(slack, "Browsing", [
                    [realisticYoutubeTab(randInt), y],
                    [realisticBrowserNonVideo(randInt), Math.max(400, slack - y)],
                ]);
            }

            if (gameEnd > gameStart + 600 && gameStart < nowSec) {
                const gspan = Math.max(60, gameEnd - gameStart);
                const [g1, g2] = pickTwoGames();
                const gs = Math.max(400, Math.floor(gspan * (0.35 + Math.random() * 0.25)));
                mkAwake(dayWake, daySleep, "Gaming", gameStart, gameEnd, [
                    [realisticGameWindow(randInt, g1), gs],
                    [realisticGameWindow(randInt, g2), Math.max(400, gspan - gs)],
                ]);
            }

            const wdur = Math.max(60, watchEnd - watchStart);
            const wA = Math.max(300, Math.floor(wdur * (0.45 + Math.random() * 0.22)));
            const [wYt, wNf] = realisticWatchingPair(randInt);
            mkAwake(dayWake, daySleep, "Watching", watchStart, watchEnd, [
                [wYt, wA],
                [wNf, Math.max(120, wdur - wA)],
            ]);
        }
    }

    timeBlocks = blocks;
    mergedLogs = mergeRows;
    rawLogs = raws;

    googleCalendars = [
        {
            id: 1,
            google_calendar_id: "cal_family_time",
            name: "Family time",
            color: "#0B8043",
            account_email: "demo.user@gmail.com",
        },
        {
            id: 2,
            google_calendar_id: "cal_friends",
            name: "Friends",
            color: "#7986CB",
            account_email: "demo.user@gmail.com",
        },
        {
            id: 3,
            google_calendar_id: "cal_sleep",
            name: "Sleep",
            color: "#673AB7",
            account_email: "demo.user@gmail.com",
        },
    ];
}


function buildCategoryStats(
    blocks: TimeBlockRow[],
    ws: number,
    we: number
): {
    total: number;
    cats: Map<string, { dur: number; color: string | null }>;
    apps: Map<string, number>;
    hourly: number[];
    dayCat: { day: number; category: string; total_duration: number }[];
    activeDayStarts: Set<number>;
    dayTotals: Map<number, number>;
} {
    const cats = new Map<string, { dur: number; color: string | null }>();
    const apps = new Map<string, number>();
    let total = 0;
    const hourly = Array.from({ length: 25 }, () => 0);
    const dayCat: { day: number; category: string; total_duration: number }[] = [];
    const activeDayStarts = new Set<number>();
    const dayTotals = new Map<number, number>();

    const catColor = (name: string) =>
        categories.find((c) => c.name === name)?.color ?? null;

    for (const b of blocks) {
        const od = overlapSec(b, ws, we);
        if (od <= 0) continue;
        total += od;
        const prev = cats.get(b.category) ?? { dur: 0, color: catColor(b.category) };
        prev.dur += od;
        cats.set(b.category, prev);

        const appSum = sumApps(b);
        for (const ap of b.apps) {
            const share = appSum > 0 ? ap.total_duration / appSum : 0;
            apps.set(ap.app, (apps.get(ap.app) ?? 0) + od * share);
        }

        const mid = (Math.max(b.start_time, ws) + Math.min(b.end_time, we)) / 2;
        const hour = getHourLocal(Math.floor(mid));
        if (hour >= 0 && hour < 25) {
            hourly[hour] += od;
        }

        dayCat.push({
            day: mondayBasedDayIndex(Math.floor(mid)),
            category: b.category,
            total_duration: od,
        });

        const dayKey = getLocalDayStartSec(Math.max(b.start_time, ws));
        activeDayStarts.add(dayKey);
        dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + od);
    }

    return { total, cats, apps, hourly, dayCat, activeDayStarts, dayTotals };
}

function weekStatistics(ws: number, we: number) {
    seed();
    const daySec = 86400;
    const blocks = blocksInRangeEffective(ws, we);
    const prevWs = ws - 7 * daySec;
    const prevWe = we - 7 * daySec;
    const prevBlocks = blocksInRangeEffective(prevWs, prevWe);

    const built = buildCategoryStats(blocks, ws, we);
    const prevBuilt = buildCategoryStats(prevBlocks, prevWs, prevWe);

    const { total, cats, apps, hourly, dayCat, activeDayStarts, dayTotals } = built;
    const prevTotal = prevBuilt.total;
    const prevCats = prevBuilt.cats;

    const totalRounded = Math.round(total);
    const prevTotalRounded = Math.round(prevTotal);

    let total_time_change: number | null = null;
    if (prevTotalRounded > 0) {
        total_time_change = ((totalRounded - prevTotalRounded) / prevTotalRounded) * 100;
    } else if (totalRounded > 0) {
        total_time_change = 100;
    }

    const catList = Array.from(cats.entries()).map(([category, v]) => {
        const tr = Math.round(v.dur);
        const pct = total > 0 ? (v.dur / total) * 100 : 0;
        const prevDur = prevCats.get(category)?.dur ?? 0;
        let percentage_change: number | null = null;
        if (prevDur > 0) {
            percentage_change = ((v.dur - prevDur) / prevDur) * 100;
        } else if (v.dur > 0) {
            percentage_change = 100;
        }
        return {
            category,
            total_duration: tr,
            percentage: Math.round(pct * 10) / 10,
            percentage_change,
            color: v.color,
        };
    });
    catList.sort((a, b) => b.total_duration - a.total_duration);

    const appArr = Array.from(apps.entries())
        .map(([app, total_duration]) => {
            const prevAppDur =
                prevBuilt.apps.get(app) ?? 0;
            let pch: number | null = null;
            if (prevAppDur > 0) {
                pch = ((total_duration - prevAppDur) / prevAppDur) * 100;
            } else if (total_duration > 0) {
                pch = 100;
            }
            return {
                app,
                total_duration: Math.round(total_duration),
                percentage_change: pch,
            };
        })
        .sort((a, b) => b.total_duration - a.total_duration);

    const top = appArr.slice(0, 8);
    const allApps = appArr;

    const activeList = [...activeDayStarts];
    const first_active_day =
        activeList.length > 0 ? Math.min(...activeList) : null;

    let most_active_day: [number, number] | null = null;
    let most_inactive_day: [number, number] | null = null;
    if (dayTotals.size > 0) {
        const entries = [...dayTotals.entries()];
        const maxE = entries.reduce((a, b) => (a[1] >= b[1] ? a : b));
        const minE = entries.reduce((a, b) => (a[1] <= b[1] ? a : b));
        most_active_day = [maxE[0], Math.round(maxE[1])];
        most_inactive_day = [minE[0], Math.round(minE[1])];
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const todayStart = getLocalDayStartSec(nowSec);
    const allTimeToday = rawLogs
        .filter((r) => r.timestamp >= todayStart && r.timestamp < todayStart + daySec)
        .reduce((s, r) => s + r.duration, 0);

    const totalTimeAllTime = rawLogs.reduce((s, r) => s + r.duration, 0);

    const numActive = activeDayStarts.size;
    const average_time_active_days =
        numActive > 0 ? total / numActive : 0;

    return {
        total_time: totalRounded,
        total_time_change,
        categories: catList,
        top_apps: top,
        all_apps: allApps,
        hourly_distribution: hourly.map((total_duration, hour) => ({
            hour,
            total_duration: Math.round(total_duration),
        })),
        day_category_breakdown: dayCat,
        first_active_day,
        number_of_active_days: numActive,
        total_number_of_days: 7,
        all_time_today: Math.round(allTimeToday),
        total_time_all_time: Math.round(totalTimeAllTime),
        average_time_active_days,
        most_active_day,
        most_inactive_day,
    };
}

function dayStatistics(ds: number, de: number) {
    seed();
    const blocks = blocksInRangeEffective(ds, de);
    const { total, cats, apps, hourly } = buildCategoryStats(blocks, ds, de);
    const catList = Array.from(cats.entries()).map(([category, v]) => ({
        category,
        total_duration: Math.round(v.dur),
        percentage: total > 0 ? Math.round((v.dur / total) * 1000) / 10 : 0,
        percentage_change: null as number | null,
        color: v.color,
    }));
    catList.sort((a, b) => b.total_duration - a.total_duration);
    const appArr = Array.from(apps.entries())
        .map(([app, total_duration]) => ({
            app,
            total_duration: Math.round(total_duration),
            percentage_change: null as number | null,
        }))
        .sort((a, b) => b.total_duration - a.total_duration);
    return {
        total_time: Math.round(total),
        categories: catList,
        top_apps: appArr.slice(0, 8),
        hourly_distribution: hourly.map((total_duration, hour) => ({
            hour,
            total_duration: Math.round(total_duration),
        })),
    };
}

export async function invoke<T>(
    cmd: string,
    args?: Record<string, unknown>
): Promise<T> {
    seed();
    const a = args ?? {};

    switch (cmd) {
        case "get_categories":
            return categories as unknown as T;
        case "get_category_by_id": {
            const id = Number((a as { id?: number }).id);
            const c = categories.find((x) => x.id === id);
            if (!c) throw new Error(`category ${id} not found`);
            return c as unknown as T;
        }
        case "insert_category": {
            const nc = (a as { newCategory?: { name: string; priority: number; color?: string | null } })
                .newCategory;
            if (!nc) return null as T;
            const id = nextCatId++;
            categories.push({
                id,
                name: nc.name,
                priority: nc.priority,
                color: nc.color ?? null,
            });
            return id as unknown as T;
        }
        case "update_category_by_id": {
            const cat = (a as { cat?: CategoryRow }).cat;
            if (!cat) return null as T;
            const i = categories.findIndex((x) => x.id === cat.id);
            if (i >= 0) {
                const oldName = categories[i].name;
                categories[i] = { ...cat };
                if (oldName !== cat.name) {
                    mergedLogs = mergedLogs.map((m) =>
                        m.category === oldName ? { ...m, category: cat.name } : m
                    );
                    timeBlocks = timeBlocks.map((tb) =>
                        tb.category === oldName ? { ...tb, category: cat.name } : tb
                    );
                }
            }
            syncDemoCategoriesFromRegexRules();
            return null as T;
        }
        case "delete_category_by_id": {
            const id = Number((a as { id?: number }).id);
            const cascade = Boolean((a as { cascade?: boolean }).cascade);
            const removed = categories.find((c) => c.id === id);
            const removedName = removed?.name;
            categories = categories.filter((c) => c.id !== id);
            if (cascade && removedName) {
                catRegex = catRegex.filter((r) => r.cat_id !== id);
                mergedLogs = mergedLogs.filter((m) => m.category !== removedName);
                timeBlocks = timeBlocks.filter((tb) => tb.category !== removedName);
            }
            return null as T;
        }
        case "get_cat_regex":
            return catRegex as unknown as T;
        case "get_cat_regex_by_id": {
            const id = Number((a as { id?: number }).id);
            const r = catRegex.find((x) => x.id === id);
            if (!r) throw new Error("regex not found");
            return r as unknown as T;
        }
        case "insert_cat_regex": {
            const nr = (a as { newCategoryRegex?: { cat_id: number; regex: string } })
                .newCategoryRegex;
            if (!nr) return null as T;
            const id = nextRegexId++;
            catRegex.push({ id, cat_id: nr.cat_id, regex: nr.regex });
            syncDemoCategoriesFromRegexRules();
            return id as unknown as T;
        }
        case "update_cat_regex_by_id": {
            const cr = (a as { catRegex?: RegexRow }).catRegex;
            if (!cr) return null as T;
            const i = catRegex.findIndex((x) => x.id === cr.id);
            if (i >= 0) catRegex[i] = { ...cr };
            syncDemoCategoriesFromRegexRules();
            return null as T;
        }
        case "delete_cat_regex_by_id": {
            const id = Number((a as { id?: number }).id);
            catRegex = catRegex.filter((r) => r.id !== id);
            syncDemoCategoriesFromRegexRules();
            return null as T;
        }
        case "get_logs":
            return rawLogs
                .filter((r) => !isAppSkippedByRules(r.app))
                .map((r) => ({
                    ...r,
                    timestamp: new Date(r.timestamp * 1000),
                })) as unknown as T;
        case "get_log_by_id": {
            const id = Number((a as { id?: number }).id);
            const r = rawLogs.find((x) => x.id === id);
            if (!r) throw new Error("log not found");
            return {
                ...r,
                timestamp: new Date(r.timestamp * 1000),
            } as unknown as T;
        }
        case "get_logs_by_category": {
            const req = (a as { request?: { category: string; start_time: number; end_time: number } })
                .request;
            if (!req) return [] as unknown as T;
            const rows = mergedLogs.filter(
                (m) =>
                    !isAppSkippedByRules(m.app) &&
                    m.category === req.category &&
                    m.timestamp >= req.start_time &&
                    m.timestamp <= req.end_time
            );
            return rows.map(({ category, ...rest }) => rest) as unknown as T;
        }
        case "get_logs_for_time_block": {
            const req = (a as {
                request?: { app_names: string[]; start_time: number; end_time: number };
            }).request;
            if (!req) return [] as unknown as T;
            const set = new Set(req.app_names);
            const rows = mergedLogs.filter(
                (m) =>
                    !isAppSkippedByRules(m.app) &&
                    set.has(m.app) &&
                    m.timestamp + m.duration >= req.start_time &&
                    m.timestamp <= req.end_time
            );
            return rows.map(({ category, ...rest }) => rest) as unknown as T;
        }
        case "count_logs_for_time_block": {
            const req = (a as {
                request?: { app_names: string[]; start_time: number; end_time: number };
            }).request;
            if (!req) return 0 as unknown as T;
            const set = new Set(req.app_names);
            const n = mergedLogs.filter(
                (m) =>
                    set.has(m.app) &&
                    m.timestamp + m.duration >= req.start_time &&
                    m.timestamp <= req.end_time
            ).length;
            return n as unknown as T;
        }
        case "count_matching_logs": {
            const regexPattern = String((a as { regexPattern?: string }).regexPattern ?? "");
            let re: RegExp;
            try {
                re = new RegExp(regexPattern);
            } catch {
                return 0 as unknown as T;
            }
            const n = mergedLogs.filter((m) => re.test(m.app)).length;
            return n as unknown as T;
        }
        case "delete_log_by_id": {
            const id = Number((a as { id?: number }).id);
            removeLogIdsFromBlocks(new Set([id]));
            rawLogs = rawLogs.filter((r) => r.id !== id);
            mergedLogs = mergedLogs.filter((m) => !m.ids.includes(id));
            return null as T;
        }
        case "delete_logs_by_ids": {
            const ids = (a as { ids?: number[] }).ids ?? [];
            const set = new Set(ids);
            removeLogIdsFromBlocks(set);
            rawLogs = rawLogs.filter((r) => !set.has(r.id));
            mergedLogs = mergedLogs.filter((m) => !m.ids.some((i) => set.has(i)));
            return null as T;
        }
        case "delete_logs_for_time_block": {
            const req = (a as {
                request?: { app_names: string[]; start_time: number; end_time: number };
            }).request;
            if (!req) return 0 as unknown as T;
            const set = new Set(req.app_names);
            const toRemove = mergedLogs.filter(
                (m) =>
                    set.has(m.app) &&
                    m.timestamp + m.duration >= req.start_time &&
                    m.timestamp <= req.end_time
            );
            const idSet = new Set(toRemove.flatMap((m) => m.ids));
            removeLogIdsFromBlocks(idSet);
            rawLogs = rawLogs.filter((r) => !idSet.has(r.id));
            mergedLogs = mergedLogs.filter((m) => !toRemove.includes(m));
            return toRemove.length as unknown as T;
        }
        case "get_week": {
            const weekStart = Number(
                (a as { weekStart?: number; week_start?: number }).weekStart ??
                    (a as { week_start?: number }).week_start
            );
            const weekEnd = Number(
                (a as { weekEnd?: number; week_end?: number }).weekEnd ??
                    (a as { week_end?: number }).week_end
            );
            const out = blocksInRangeEffective(weekStart, weekEnd).map((b) => ({
                id: b.id,
                category: b.category,
                start_time: b.start_time,
                end_time: b.end_time,
                apps: b.apps.map((x) => ({
                    app: x.app,
                    total_duration: x.total_duration,
                })),
            }));
            return out as unknown as T;
        }
        case "get_week_statistics": {
            const weekStart = Number(
                (a as { weekStart?: number; week_start?: number }).weekStart ??
                    (a as { week_start?: number }).week_start ??
                    0
            );
            const weekEnd = Number(
                (a as { weekEnd?: number; week_end?: number }).weekEnd ??
                    (a as { week_end?: number }).week_end ??
                    0
            );
            return weekStatistics(weekStart, weekEnd) as unknown as T;
        }
        case "get_total_statistics": {
            if (timeBlocks.length === 0) return weekStatistics(0, 1) as unknown as T;
            const mn = Math.min(...timeBlocks.map((b) => b.start_time));
            const mx = Math.max(...timeBlocks.map((b) => b.end_time));
            return weekStatistics(mn, mx) as unknown as T;
        }
        case "get_day_statistics": {
            const dayStart = Number(
                (a as { dayStart?: number; day_start?: number }).dayStart ??
                    (a as { day_start?: number }).day_start ??
                    0
            );
            const dayEnd = Number(
                (a as { dayEnd?: number; day_end?: number }).dayEnd ??
                    (a as { day_end?: number }).day_end ??
                    0
            );
            return dayStatistics(dayStart, dayEnd) as unknown as T;
        }
        case "get_calendar_view_prefs":
            return calendarPrefsJson as unknown as T;
        case "set_calendar_view_prefs": {
            const json = String((a as { json?: string }).json ?? "");
            calendarPrefsJson = json;
            return null as T;
        }
        case "get_skipped_apps":
            return skippedApps as unknown as T;
        case "insert_skipped_app": {
            const na = (a as { newApp?: { regex: string } }).newApp;
            if (!na) return null as T;
            const id = nextSkipId++;
            skippedApps.push({ id, regex: na.regex });
            return id as unknown as T;
        }
        case "insert_skipped_app_and_delete_logs": {
            const na = (a as { newApp?: { regex: string } }).newApp;
            if (!na) return 0 as unknown as T;
            const id = nextSkipId++;
            skippedApps.push({ id, regex: na.regex });
            let re: RegExp;
            try {
                re = new RegExp(na.regex);
            } catch {
                return id as unknown as T;
            }
            const before = mergedLogs.length;
            const toDelete = new Set<number>();
            for (const r of rawLogs) {
                if (re.test(r.app)) toDelete.add(r.id);
            }
            removeLogIdsFromBlocks(toDelete);
            mergedLogs = mergedLogs.filter((m) => !re.test(m.app));
            rawLogs = rawLogs.filter((r) => !re.test(r.app));
            return (before - mergedLogs.length) as unknown as T;
        }
        case "update_skipped_app_by_id": {
            const sa = (a as { skippedApp?: SkippedRow }).skippedApp;
            if (!sa) return null as T;
            const i = skippedApps.findIndex((x) => x.id === sa.id);
            if (i >= 0) skippedApps[i] = { ...sa };
            return null as T;
        }
        case "delete_skipped_app_by_id": {
            const id = Number((a as { id?: number }).id);
            skippedApps = skippedApps.filter((s) => s.id !== id);
            return null as T;
        }
        case "restore_default_skipped_apps":
            skippedApps = defaultSkipped.map((s) => ({ ...s }));
            return null as T;
        case "get_tracking_status":
            return tracking as unknown as T;
        case "set_tracking_status": {
            tracking = Boolean((a as { isTracking?: boolean }).isTracking);
            return null as T;
        }
        case "get_google_auth_status":
            return {
                logged_in: googleLoggedIn,
                email: googleLoggedIn ? "demo.user@gmail.com" : undefined,
            } as unknown as T;
        case "get_google_calendars":
            return googleCalendars as unknown as T;
        case "get_google_calendar_by_id": {
            const id = Number((a as { id?: number }).id);
            const c = googleCalendars.find((x) => x.id === id);
            if (!c) throw new Error("calendar not found");
            return c as unknown as T;
        }
        case "get_google_calendar_events": {
            const p = (a as {
                params?: { calendarId: number; startTime: number; endTime: number };
            }).params;
            if (!p) return [] as unknown as T;
            return googleEvents.filter(
                (e) =>
                    e.calendar_id === p.calendarId &&
                    e.end > p.startTime &&
                    e.start < p.endTime
            ) as unknown as T;
        }
        case "get_all_google_calendar_events": {
            const p = (a as { params?: { startTime: number; endTime: number } }).params;
            if (!p) return [] as unknown as T;
            return googleEvents.filter((e) => e.end > p.startTime && e.start < p.endTime) as unknown as T;
        }
        case "insert_google_calendar": {
            const nc = (a as {
                newCalendar?: {
                    google_calendar_id: string;
                    name: string;
                    color: string;
                    account_email: string;
                };
            }).newCalendar;
            if (!nc) return null as T;
            const id = nextGCalId++;
            googleCalendars.push({
                id,
                google_calendar_id: nc.google_calendar_id,
                name: nc.name,
                color: nc.color,
                account_email: nc.account_email,
            });
            return id as unknown as T;
        }
        case "update_google_calendar": {
            const u = (a as { update?: { id: number; name?: string; color?: string } }).update;
            if (!u) return null as T;
            const row = googleCalendars.find((c) => c.id === u.id);
            if (row) {
                if (u.name !== undefined) row.name = u.name;
                if (u.color !== undefined) row.color = u.color;
            }
            return null as T;
        }
        case "delete_google_calendar": {
            const id = Number((a as { id?: number }).id);
            googleCalendars = googleCalendars.filter((c) => c.id !== id);
            googleEvents = googleEvents.filter((e) => e.calendar_id !== id);
            return null as T;
        }
        case "create_google_calendar_event": {
            const p = (a as {
                params?: {
                    calendar_id: number;
                    title: string;
                    start: number;
                    end: number;
                    description?: string;
                };
            }).params;
            if (!p) return "" as unknown as T;
            const event_id = `evt_${nextEventSeq++}`;
            googleEvents.push({
                calendar_id: p.calendar_id,
                event_id,
                title: p.title,
                start: p.start,
                end: p.end,
                description: p.description,
            });
            return event_id as unknown as T;
        }
        case "update_google_calendar_event": {
            const u = (a as {
                update?: {
                    calendar_id: number;
                    event_id: string;
                    title: string;
                    start: number;
                    end: number;
                    description?: string;
                };
            }).update;
            if (!u) return null as T;
            const ev = googleEvents.find(
                (e) => e.calendar_id === u.calendar_id && e.event_id === u.event_id
            );
            if (ev) {
                ev.title = u.title;
                ev.start = u.start;
                ev.end = u.end;
                ev.description = u.description;
            }
            return null as T;
        }
        case "delete_google_calendar_event": {
            const p = (a as {
                params?: { calendar_id: number; event_id: string };
            }).params;
            if (!p) return null as T;
            googleEvents = googleEvents.filter(
                (e) => !(e.calendar_id === p.calendar_id && e.event_id === p.event_id)
            );
            return null as T;
        }
        case "google_oauth_login":
            googleLoggedIn = true;
            return {
                logged_in: true,
                email: "demo.user@gmail.com",
            } as unknown as T;
        case "google_oauth_logout":
            googleLoggedIn = false;
            return null as T;
        case "get_google_oauth_app_credentials":
            return {
                client_id: oauthClientId,
                client_secret: oauthClientSecret,
            } as unknown as T;
        case "set_google_oauth_app_credentials": {
            const cid = String(
                (a as { clientId?: string; client_id?: string }).clientId ??
                    (a as { client_id?: string }).client_id ??
                    ""
            );
            const sec = String(
                (a as { clientSecret?: string; client_secret?: string }).clientSecret ??
                    (a as { client_secret?: string }).client_secret ??
                    ""
            );
            oauthClientId = cid || oauthClientId;
            oauthClientSecret = sec || oauthClientSecret;
            return null as T;
        }
        case "list_available_google_calendars":
            return DEMO_GOOGLE_CALENDAR_CATALOG.map((c) => ({
                ...c,
                selected: googleCalendars.some(
                    (g) => g.google_calendar_id === c.google_calendar_id
                ),
            })) as unknown as T;
        case "get_app_version":
            return "1.8.2-demo" as unknown as T;
        case "refresh_tray_menu":
            return null as T;
        case "check_update_cmd":
            return false as unknown as T;
        case "apply_update_cmd":
            return null as T;
        default:
            console.warn(`[demo mock] unknown invoke command: ${cmd}`);
            return null as T;
    }
}
