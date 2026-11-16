/** Escape text for a contains match in both Rust regex and JavaScript previews. */
export function literalMatchPattern(text: string): string {
    return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/** Decode only patterns that can be proved to be literal contains matches. */
export function literalPatternText(pattern: string): string | null {
    const text = pattern.replace(/\\([\\^$.*+?()[\]{}|])/g, "$1");
    return literalMatchPattern(text) === pattern ? text : null;
}
