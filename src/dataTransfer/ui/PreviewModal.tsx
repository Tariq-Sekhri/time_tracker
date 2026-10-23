import {useEffect, useRef} from "react";
import {createPortal} from "react-dom";
import {Banner} from "./common.tsx";
import {IconX, Spinner} from "./icons.tsx";
import type {PreviewTable} from "./preview.ts";

export type PreviewContent =
    | {kind: "loading"}
    | {kind: "error"; message: string}
    | {kind: "pdf"; url: string}
    | {kind: "tables"; tables: PreviewTable[]; totals: number[]};

/** Export preview: an embedded PDF, or the first rows of each table. */
export default function PreviewModal({title, subtitle, content, onClose}: {
    title: string;
    subtitle?: string;
    content: PreviewContent;
    onClose: () => void;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const previousFocus = useRef<Element | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        previousFocus.current = document.activeElement;
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {event.preventDefault(); onClose();}
            if (event.key !== "Tab") return;
            const controls = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), iframe, [tabindex="0"]') ?? []);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
            else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            (previousFocus.current as HTMLElement | null)?.focus?.();
        };
    }, [onClose]);

    return createPortal(<div className="dt-modal-backdrop" onMouseDown={(event) => {if (event.target === event.currentTarget) onClose();}}>
        <div ref={modalRef} className="dt-modal" role="dialog" aria-modal="true" aria-labelledby="dt-preview-title">
            <header>
                <div><h2 id="dt-preview-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
                <button ref={closeRef} type="button" className="dt-icon-button" aria-label="Close preview" onClick={onClose}><IconX /></button>
            </header>
            <div className="dt-modal-body nice-scrollbar">
                {content.kind === "loading" && <div className="dt-inline" role="status" style={{justifyContent: "center", padding: 40, color: "var(--tt-muted)"}}>
                    <Spinner /> Building preview…
                </div>}
                {content.kind === "error" && <Banner tone="danger" role="alert"><strong>Preview failed.</strong> {content.message}</Banner>}
                {content.kind === "pdf" && <iframe src={content.url} title="PDF preview" />}
                {content.kind === "tables" && (content.tables.length === 0
                    ? <p className="settings-muted">Nothing to preview.</p>
                    : content.tables.map((table, index) => <div key={table.title + index}>
                        <div className="dt-table-caption">{table.title}
                            <span>{table.rows.length < (content.totals[index] ?? 0) ? `First ${table.rows.length} of ${content.totals[index].toLocaleString("en-US")} rows` : `${table.rows.length} rows`}</span>
                        </div>
                        <div className="dt-table-wrap nice-scrollbar">
                            <table className="dt-table">
                                <thead><tr>{table.headers.map((header, i) => <th key={i} scope="col">{header}</th>)}</tr></thead>
                                <tbody>
                                    {table.rows.length === 0 && <tr><td colSpan={Math.max(1, table.headers.length)} className="settings-muted">No rows in this range.</td></tr>}
                                    {table.rows.map((row, r) => <tr key={r}>{table.headers.map((_, c) => <td key={c} title={row[c]}>{row[c]}</td>)}</tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>))}
            </div>
        </div>
    </div>, document.body);
}
