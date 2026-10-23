import {useEffect, useRef, useState, type ReactNode} from "react";
import {IconCheck, IconInfo, IconWarning} from "./icons.tsx";

/** A numbered settings card: "2  Date range / description" with optional header actions. */
export function Section({id, step, title, description, actions, dimmed, children}: {
    id: string;
    step?: number;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    dimmed?: boolean;
    children: ReactNode;
}) {
    return <section className="settings-panel dt-section" aria-labelledby={id} data-dimmed={dimmed || undefined}>
        <div className="dt-section-head">
            <div className="dt-section-title">
                {step != null && <span className="dt-step-number" aria-hidden>{step}</span>}
                <div><h3 id={id}>{title}</h3>{description && <p>{description}</p>}</div>
            </div>
            {actions && <div className="dt-section-actions">{actions}</div>}
        </div>
        {children}
    </section>;
}

export type BannerTone = "info" | "warning" | "danger" | "success";

export function Banner({tone, children, role}: {tone: BannerTone; children: ReactNode; role?: "status" | "alert"}) {
    const icon = tone === "success" ? <IconCheck /> : tone === "info" ? <IconInfo /> : <IconWarning />;
    return <div className={`dt-banner dt-banner-${tone}`} role={role}>{icon}<div className="dt-banner-body">{children}</div></div>;
}

/** Visual checkbox used inside selectable cards (the real input is visually hidden). */
export function CheckMark() {
    return <span className="dt-checkmark" aria-hidden><IconCheck className="dt-icon-sm" /></span>;
}

export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

/** Stable JSON key so object-valued state can drive effects/debounces without identity churn. */
export function useStableJson<T>(value: T): T {
    const json = JSON.stringify(value);
    const ref = useRef({json, value});
    if (ref.current.json !== json) ref.current = {json, value};
    return ref.current.value;
}

/** Radio-group keyboard handling: arrows move selection between options. */
export function radioKeyDown<T>(event: React.KeyboardEvent, values: T[], current: T, select: (value: T) => void, idFor: (value: T) => string) {
    const index = values.indexOf(current);
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % values.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + values.length) % values.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = values.length - 1;
    else return;
    event.preventDefault();
    select(values[next]);
    document.getElementById(idFor(values[next]))?.focus();
}

export function formatCount(value: number | undefined | null): string {
    return value == null ? "—" : value.toLocaleString("en-US");
}

export function plural(count: number, one: string, many = `${one}s`): string {
    return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}
