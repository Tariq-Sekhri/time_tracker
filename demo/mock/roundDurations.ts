/** Round proportional demo shares without changing their combined duration. */
export function roundDurations(durations: Map<string, number>): Map<string, number> {
    const entries = [...durations.entries()];
    const rounded = new Map(entries.map(([name, duration]) => [name, Math.floor(duration)]));
    const remainder = Math.round(entries.reduce((sum, [, duration]) => sum + duration, 0))
        - [...rounded.values()].reduce((sum, duration) => sum + duration, 0);
    const fractions = entries.map(([name, duration]) => ({name, fraction: duration - Math.floor(duration)}))
        .sort((a, b) => b.fraction - a.fraction || a.name.localeCompare(b.name));
    for (let i = 0; i < remainder; i++) {
        const name = fractions[i].name;
        rounded.set(name, rounded.get(name)! + 1);
    }
    return rounded;
}
