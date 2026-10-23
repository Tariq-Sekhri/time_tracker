import {useEffect, useRef, useState, type ReactNode} from "react";
import {getAppMetadata, setAppMetadata} from "../../../api/appMetadata";

const WIDTH_KEY = "time-tracker:right-sidebar-width-percent";
const DEFAULT_PERCENT = 30;
const MIN_WIDTH = 280;
const MAX_PERCENT = 60;

export default function ResizableSidebar({collapsed, children}: {collapsed: boolean; children: ReactNode}) {
    const panel = useRef<HTMLDivElement>(null);
    const drag = useRef<{pointerId: number; startX: number; startPercent: number; parentWidth: number; minPercent: number} | null>(null);
    const interacted = useRef(false);
    const currentPercent = useRef(DEFAULT_PERCENT);
    const [percent, setPercent] = useState(DEFAULT_PERCENT);
    const [resizing, setResizing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getAppMetadata(WIDTH_KEY).then(raw => {
            const saved = Number(raw);
            if (!cancelled && !interacted.current && raw !== null && Number.isFinite(saved) && saved > 0) {
                currentPercent.current = Math.min(MAX_PERCENT, saved);
                setPercent(currentPercent.current);
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const update = (next: number, minPercent: number) => {
        interacted.current = true;
        currentPercent.current = Math.max(Math.min(minPercent, 100), Math.min(Math.max(MAX_PERCENT, minPercent), next));
        setPercent(currentPercent.current);
    };
    const save = () => { void setAppMetadata(WIDTH_KEY, String(currentPercent.current)).catch(() => {}); };
    const dimensions = () => {
        const element = panel.current;
        const parent = element?.parentElement;
        if (!element || !parent || !parent.clientWidth) return null;
        // Ratios of viewport measurements also work when the app uses CSS zoom.
        return {parentWidth: parent.getBoundingClientRect().width, minPercent: MIN_WIDTH / parent.clientWidth * 100};
    };

    return <div ref={panel}
        className={`theme-sidebar relative h-full min-h-0 flex-shrink-0 overflow-hidden bg-black flex flex-col ${collapsed ? "border-l border-gray-700 items-center p-2" : ""}`}
        style={{width: collapsed ? 64 : `${percent}%`, minWidth: collapsed ? 64 : "min(280px, 100%)", maxWidth: collapsed ? 64 : "max(280px, 60%)", userSelect: resizing ? "none" : undefined}}
    >
        {children}
        {!collapsed && <div role="separator" aria-label="Resize right sidebar" aria-orientation="vertical"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${Math.round(percent)}% width, minimum 280 pixels`}
            tabIndex={0}
            className={`absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-sky-500/60 focus-visible:bg-sky-500/60 focus-visible:outline-none ${resizing ? "bg-sky-500/60" : ""}`}
            onPointerDown={event => {
                if (event.button !== 0) return;
                const size = dimensions();
                if (!size || size.parentWidth <= 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                interacted.current = true;
                drag.current = {pointerId: event.pointerId, startX: event.clientX, startPercent: (panel.current!.getBoundingClientRect().width / size.parentWidth) * 100, ...size};
                setResizing(true);
            }}
            onPointerMove={event => {
                const active = drag.current;
                if (!active || event.pointerId !== active.pointerId) return;
                update(active.startPercent + (active.startX - event.clientX) / active.parentWidth * 100, active.minPercent);
            }}
            onPointerUp={event => {
                if (drag.current?.pointerId !== event.pointerId) return;
                drag.current = null;
                setResizing(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
                save();
            }}
            onLostPointerCapture={() => {
                if (!drag.current) return;
                drag.current = null;
                setResizing(false);
                save();
            }}
            onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                const size = dimensions();
                if (!size) return;
                event.preventDefault();
                update(event.key === "Home" ? size.minPercent : event.key === "End" ? MAX_PERCENT : Math.max(size.minPercent, percent) + (event.key === "ArrowLeft" ? 1 : -1), size.minPercent);
                save();
            }}
        />}
    </div>;
}
