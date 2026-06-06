import { pickBestMatchingRegex } from "../../src/utils/pickBestMatchingRegex.ts";

export type DemoLog = {
    id: number;
    app: string;
    timestamp: number;
    duration: number;
};

export type DemoCategory = {
    id: number;
    name: string;
    priority: number;
};

export type DemoCategoryRegex = {
    id: number;
    cat_id: number;
    regex: string;
};

export type DemoSkippedRegex = {
    regex: string;
};

export type TimeBlockSettings = {
    minLogDuration: number;
    maxAttachDistance: number;
    lookaheadWindow: number;
    minDuration: number;
};

export type DemoTimeBlock = {
    id: number;
    category: string;
    start_time: number;
    end_time: number;
    apps: { app: string; total_duration: number }[];
};

export type DemoMergedLog = {
    ids: number[];
    app: string;
    timestamp: number;
    duration: number;
};

type CachedRegex = {
    re: RegExp;
    regexStr: string;
    category: string;
    priority: number;
};

type InternalBlock = {
    id: number;
    category: string;
    start_time: number;
    end_time: number;
    apps: { app: string; total_duration: number }[];
};

function buildRegexTable(
    categories: DemoCategory[],
    catRegex: DemoCategoryRegex[]
): CachedRegex[] {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const out: CachedRegex[] = [];
    for (const row of catRegex) {
        const cat = catById.get(row.cat_id);
        if (!cat) continue;
        try {
            out.push({
                re: new RegExp(row.regex),
                regexStr: row.regex,
                category: cat.name,
                priority: cat.priority,
            });
        } catch {
        }
    }
    return out;
}

export function deriveCategory(app: string, regexTable: CachedRegex[]): string {
    const best = pickBestMatchingRegex(app, regexTable);
    return best?.category ?? "Miscellaneous";
}

function isSkipped(app: string, skipped: DemoSkippedRegex[]): boolean {
    for (const s of skipped) {
        try {
            if (new RegExp(s.regex).test(app)) return true;
        } catch {
        }
    }
    return false;
}

function newBlock(log: DemoLog, id: number, category: string): InternalBlock {
    return {
        id,
        category,
        start_time: log.timestamp,
        end_time: log.timestamp + log.duration,
        apps: [{ app: log.app, total_duration: log.duration }],
    };
}

function getTimeBlocks(
    logs: DemoLog[],
    regexTable: CachedRegex[],
    settings: TimeBlockSettings
): InternalBlock[] {
    if (logs.length === 0) return [];

    const minLogDuration = Math.max(1, settings.minLogDuration);
    const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
    const longLogs = sorted.filter((l) => l.duration >= minLogDuration);
    const shortLogs = sorted.filter((l) => l.duration < minLogDuration);

    if (longLogs.length === 0) return [];

    const blocks: InternalBlock[] = [];
    blocks.push(newBlock(longLogs[0], 0, deriveCategory(longLogs[0].app, regexTable)));

    let blockIndex = 0;
    for (const log of longLogs.slice(1)) {
        const logCat = deriveCategory(log.app, regexTable);
        const logEnd = log.timestamp + log.duration;
        const current = blocks[blockIndex];

        if (current.category === logCat || logCat === "Miscellaneous") {
            if (log.timestamp <= current.end_time) {
                current.end_time = Math.max(current.end_time, logEnd);
                const existing = current.apps.find((a) => a.app === log.app);
                if (existing) {
                    existing.total_duration += log.duration;
                } else {
                    current.apps.push({ app: log.app, total_duration: log.duration });
                }
            } else {
                blockIndex += 1;
                blocks.push(newBlock(log, blockIndex, logCat));
            }
        } else {
            blockIndex += 1;
            blocks.push(newBlock(log, blockIndex, logCat));
        }
    }

    const maxAttachDistance = Math.max(0, settings.maxAttachDistance);
    for (const shortLog of shortLogs) {
        if (blocks.length === 0) break;

        const shortCat = deriveCategory(shortLog.app, regexTable);
        let bestIdx: number | null = null;
        let minDistance = Number.MAX_SAFE_INTEGER;

        for (let idx = 0; idx < blocks.length; idx++) {
            const block = blocks[idx];
            if (block.category !== shortCat) continue;

            let distance: number;
            if (shortLog.timestamp < block.start_time) {
                distance = block.start_time - shortLog.timestamp;
            } else if (shortLog.timestamp > block.end_time) {
                distance = shortLog.timestamp - block.end_time;
            } else {
                distance = 0;
            }

            if (distance <= maxAttachDistance && distance < minDistance) {
                minDistance = distance;
                bestIdx = idx;
            }
        }

        if (bestIdx != null) {
            const block = blocks[bestIdx];
            const existing = block.apps.find((a) => a.app === shortLog.app);
            if (existing) {
                existing.total_duration += shortLog.duration;
            } else {
                block.apps.push({ app: shortLog.app, total_duration: shortLog.duration });
            }
        }
    }

    return blocks;
}

function transformTimeBlocks(
    blocks: InternalBlock[],
    settings: TimeBlockSettings
): InternalBlock[] {
    const lookaheadWindow = Math.max(0, settings.lookaheadWindow);
    const minDuration = Math.max(1, settings.minDuration);

    if (blocks.length === 0) return [];

    const result = blocks.map((b) => ({
        ...b,
        apps: b.apps.map((a) => ({ ...a })),
    }));
    result.sort((a, b) => a.start_time - b.start_time);
    const toRemove = new Set<number>();

    for (let i = 0; i < result.length; i++) {
        if (toRemove.has(i)) continue;
        const currentCategory = result[i].category;

        for (let j = i + 1; j < result.length; j++) {
            if (toRemove.has(j)) continue;
            const future = result[j];
            if (future.category !== currentCategory) continue;

            const gap = future.start_time - result[i].end_time;
            if (gap > lookaheadWindow) continue;

            result[i].end_time = Math.max(result[i].end_time, future.end_time);
            result[i].start_time = Math.min(result[i].start_time, future.start_time);

            for (const futureApp of future.apps) {
                const existing = result[i].apps.find((a) => a.app === futureApp.app);
                if (existing) {
                    existing.total_duration += futureApp.total_duration;
                } else {
                    result[i].apps.push({ ...futureApp });
                }
            }
            toRemove.add(j);
        }
    }

    const kept = result.filter((_, idx) => !toRemove.has(idx));
    return kept.filter((block) => {
        const duration = block.apps.reduce((s, a) => s + a.total_duration, 0);
        return duration >= minDuration;
    });
}

export function buildTimeBlocksFromLogs(
    logs: DemoLog[],
    rangeStart: number,
    rangeEnd: number,
    categories: DemoCategory[],
    catRegex: DemoCategoryRegex[],
    skipped: DemoSkippedRegex[],
    settings: TimeBlockSettings
): DemoTimeBlock[] {
    const regexTable = buildRegexTable(categories, catRegex);
    const filtered = logs.filter(
        (log) =>
            !isSkipped(log.app, skipped) &&
            log.timestamp >= rangeStart &&
            log.timestamp <= rangeEnd
    );
    if (filtered.length === 0) return [];

    const blocks = transformTimeBlocks(getTimeBlocks(filtered, regexTable, settings), settings);
    return blocks.map((b, idx) => ({
        id: idx + 1,
        category: b.category,
        start_time: b.start_time,
        end_time: b.end_time,
        apps: b.apps.map((a) => ({ ...a })),
    }));
}

export function mergeLogsInTimeBlock(logs: DemoLog[]): DemoMergedLog[] {
    const appMap = new Map<string, DemoMergedLog>();
    for (const log of logs) {
        const existing = appMap.get(log.app);
        if (existing) {
            existing.duration += log.duration;
            existing.ids.push(log.id);
            if (log.timestamp < existing.timestamp) {
                existing.timestamp = log.timestamp;
            }
        } else {
            appMap.set(log.app, {
                ids: [log.id],
                app: log.app,
                timestamp: log.timestamp,
                duration: log.duration,
            });
        }
    }
    return [...appMap.values()];
}

export function logsOverlappingBlock(
    logs: DemoLog[],
    appNames: Set<string>,
    startTime: number,
    endTime: number,
    minLogDuration: number
): DemoLog[] {
    const minD = Math.max(1, minLogDuration);
    return logs.filter(
        (log) =>
            appNames.has(log.app) &&
            log.duration >= minD &&
            log.timestamp + log.duration >= startTime &&
            log.timestamp <= endTime
    );
}

export function logsForCategoryInRange(
    logs: DemoLog[],
    category: string,
    rangeStart: number,
    rangeEnd: number,
    minLogDuration: number,
    categories: DemoCategory[],
    catRegex: DemoCategoryRegex[],
    skipped: DemoSkippedRegex[]
): DemoLog[] {
    const regexTable = buildRegexTable(categories, catRegex);
    const minD = Math.max(1, minLogDuration);
    return logs.filter(
        (log) =>
            !isSkipped(log.app, skipped) &&
            log.timestamp >= rangeStart &&
            log.timestamp <= rangeEnd &&
            log.duration >= minD &&
            deriveCategory(log.app, regexTable) === category
    );
}
