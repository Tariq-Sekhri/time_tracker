import {useCallback, useEffect, useRef, useState, type ReactNode} from "react";
import {getAppMetadata, setAppMetadata} from "../../../api/appMetadata";

export default function ResizableSidebar({collapsed, children, side = "right"}: {collapsed: boolean; children: ReactNode; side?: "left" | "right"}) {
    const WIDTH_KEY = `time-tracker:${side}-sidebar-width-percent`;
    const DEFAULT_PERCENT = side === "right" ? 30 : 20;
    const MIN_WIDTH = side === "right" ? 280 : 220;
    const MAX_PERCENT = side === "right" ? 60 : 40;
    const collapsedWidth = side === "right" ? 64 : 56;
    const panel = useRef<HTMLDivElement>(null);
    const drag = useRef<{handle: HTMLDivElement; pointerId: number; startX: number; startPercent: number; parentWidth: number; minPercent: number} | null>(null);
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
    }, [WIDTH_KEY, MAX_PERCENT]);

    const finishDrag = useCallback((pointerId?: number) => {
        const active = drag.current;
        if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
        drag.current = null;
        setResizing(false);
        if (active.handle.hasPointerCapture?.(active.pointerId)) active.handle.releasePointerCapture(active.pointerId);
        // Pointer resizing must not leave the keyboard focus highlight behind.
        if (document.activeElement === active.handle) active.handle.blur();
        void setAppMetadata(WIDTH_KEY, String(currentPercent.current)).catch(() => {});
    }, [WIDTH_KEY]);

    useEffect(() => {
        const release = (event: PointerEvent) => finishDrag(event.pointerId);
        const blur = () => finishDrag();
        window.addEventListener("pointerup", release, true);
        window.addEventListener("pointercancel", release, true);
        window.addEventListener("blur", blur);
        return () => {
            window.removeEventListener("pointerup", release, true);
            window.removeEventListener("pointercancel", release, true);
            window.removeEventListener("blur", blur);
            finishDrag();
        };
    }, [finishDrag]);

    useEffect(() => { if (collapsed) finishDrag(); }, [collapsed, finishDrag]);

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
        className={`theme-sidebar relative h-full min-h-0 flex-shrink-0 overflow-hidden bg-black flex flex-col ${collapsed && side === "right" ? "border-l border-gray-700 items-center p-2" : ""}`}
        style={{width: collapsed ? collapsedWidth : `${percent}%`, minWidth: collapsed ? collapsedWidth : `min(${MIN_WIDTH}px, 100%)`, maxWidth: collapsed ? collapsedWidth : `max(${MIN_WIDTH}px, ${MAX_PERCENT}%)`, userSelect: resizing ? "none" : undefined}}
    >
        {children}
        {!collapsed && <div role="separator" aria-label={`Resize ${side} sidebar`} aria-orientation="vertical"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${Math.round(percent)}% width, minimum ${MIN_WIDTH} pixels`}
            title={`Drag to resize ${side} sidebar`}
            onClick={event => event.stopPropagation()}
            tabIndex={0}
            className={`absolute inset-y-0 ${side === "right" ? "left-0" : "right-0"} z-20 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-[var(--tt-accent)]/60 focus-visible:bg-[var(--tt-accent)]/60 focus-visible:outline-none ${resizing ? "bg-[var(--tt-accent)]/60" : ""}`}
            onPointerDown={event => {
                if (event.button !== 0) return;
                const size = dimensions();
                if (!size || size.parentWidth <= 0) return;
                event.preventDefault();
                event.currentTarget.blur();
                event.currentTarget.setPointerCapture(event.pointerId);
                interacted.current = true;
                drag.current = {handle: event.currentTarget, pointerId: event.pointerId, startX: event.clientX, startPercent: (panel.current!.getBoundingClientRect().width / size.parentWidth) * 100, ...size};
                setResizing(true);
            }}
            onPointerMove={event => {
                const active = drag.current;
                if (!active || event.pointerId !== active.pointerId) return;
                if (event.buttons === 0) { finishDrag(event.pointerId); return; }
                update(active.startPercent + (active.startX - event.clientX) / active.parentWidth * 100 * (side === "right" ? 1 : -1), active.minPercent);
            }}
            onPointerUp={event => finishDrag(event.pointerId)}
            onPointerCancel={event => finishDrag(event.pointerId)}
            onLostPointerCapture={event => finishDrag(event.pointerId)}
            onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                const size = dimensions();
                if (!size) return;
                event.preventDefault();
                update(event.key === "Home" ? size.minPercent : event.key === "End" ? MAX_PERCENT : Math.max(size.minPercent, percent) + (event.key === "ArrowLeft" ? 1 : -1) * (side === "right" ? 1 : -1), size.minPercent);
                save();
            }}
        />}
    </div>;
}
