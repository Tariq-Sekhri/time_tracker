export type RegexMatchCandidate = {
    regexStr: string;
    priority: number;
};

function regexSpecificityScore(pattern: string): number {
    let score = pattern.length;
    if (pattern.startsWith("^") && pattern.endsWith("$")) {
        score += 10_000;
    } else if (pattern.startsWith("^") || pattern.endsWith("$")) {
        score += 1_000;
    }
    return score;
}

export function pickBestMatchingRegex<T extends RegexMatchCandidate>(
    appName: string,
    rows: readonly T[]
): T | null {
    const matches: T[] = [];
    for (const row of rows) {
        try {
            if (new RegExp(row.regexStr).test(appName)) {
                matches.push(row);
            }
        } catch {
            continue;
        }
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
        const spec = regexSpecificityScore(b.regexStr) - regexSpecificityScore(a.regexStr);
        if (spec !== 0) return spec;
        return b.priority - a.priority;
    });
    return matches[0];
}
