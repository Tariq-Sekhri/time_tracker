export class DemoInvokeError extends Error {
    constructor(cmd: string, message: string) {
        super(`${message}`);
        this.name = `DemoInvokeError:${cmd}`;
    }
}

export function pickPayload<T extends Record<string, unknown>>(
    args: Record<string, unknown>,
    keys: string[]
): T | undefined {
    for (const key of keys) {
        const value = args[key];
        if (value !== undefined && value !== null && typeof value === "object") {
            return value as T;
        }
    }
    return undefined;
}

export function pickNumber(args: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = args[key];
        if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }
    return undefined;
}

export function pickString(args: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = args[key];
        if (typeof value === "string") return value;
    }
    return undefined;
}

export function pickNewCategoryRegex(
    args: Record<string, unknown>
): { cat_id: number; regex: string } | undefined {
    const wrapped = pickPayload<{ cat_id?: number; catId?: number; regex?: string }>(args, [
        "newCategoryRegex",
        "new_category_regex",
    ]);
    if (wrapped) {
        const cat_id = Number(wrapped.cat_id ?? wrapped.catId);
        const regex = String(wrapped.regex ?? "").trim();
        if (!Number.isFinite(cat_id) || !regex) return undefined;
        return { cat_id, regex };
    }
    const cat_id = pickNumber(args, ["cat_id", "catId"]);
    const regex = pickString(args, ["regex"])?.trim();
    if (cat_id === undefined || !regex) return undefined;
    return { cat_id, regex };
}

export function pickCategoryRegexRow(
    args: Record<string, unknown>
): { id: number; cat_id: number; regex: string } | undefined {
    const wrapped = pickPayload<{ id?: number; cat_id?: number; catId?: number; regex?: string }>(
        args,
        ["catRegex", "cat_regex"]
    );
    if (!wrapped) return undefined;
    const id = Number(wrapped.id);
    const cat_id = Number(wrapped.cat_id ?? wrapped.catId);
    const regex = String(wrapped.regex ?? "").trim();
    if (!Number.isFinite(id) || !Number.isFinite(cat_id) || !regex) return undefined;
    return { id, cat_id, regex };
}

export function pickCategoryRow(
    args: Record<string, unknown>
): Record<string, unknown> | undefined {
    return pickPayload(args, ["cat", "category"]);
}

export function pickNewCategory(
    args: Record<string, unknown>
): { name: string; priority: number; color?: string | null } | undefined {
    const wrapped = pickPayload<{ name?: string; priority?: number; color?: string | null }>(args, [
        "newCategory",
        "new_category",
    ]);
    if (!wrapped?.name || wrapped.priority === undefined) return undefined;
    return {
        name: String(wrapped.name),
        priority: Number(wrapped.priority),
        color: wrapped.color ?? null,
    };
}

export function validateRegexPattern(pattern: string, cmd: string): void {
    if (!pattern.trim()) {
        throw new DemoInvokeError(cmd, "Regex pattern cannot be empty");
    }
    try {
        new RegExp(pattern);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "invalid pattern";
        throw new DemoInvokeError(cmd, `Invalid regex: ${msg}`);
    }
}
