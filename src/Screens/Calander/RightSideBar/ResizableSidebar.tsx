import {useCallback, useEffect, useRef, useState, type ReactNode} from "react";
import {getAppMetadata, setAppMetadata} from "../../../api/appMetadata";

export default function ResizableSidebar({collapsed, children, side = "right"}: {collapsed: boolean; children: ReactNode; side?: "left" | "right"}) {
    const WIDTH_KEY = `time-tracker:${side}-sidebar-width-px`;
    const LEGACY_WIDTH_KEY = `time-tracker:${side}-sidebar-width-percent`;
    const DEFAULT_WIDTH = side === "right" ? 460 : 280;
    const MIN_WIDTH = side === "right" ? 360 : 240;
    const MAX_WIDTH = side === "right" ? 500 : 320;
    const collapsedWidth = side === "right" ? 64 : 56;
    const panel = useRef<HTMLDivElement>(null);
    const drag = useRef<{handle: HTMLDivElement; pointerId: number; startX: number; startWidth: number; zoom: number} | null>(null);
    const interacted = useRef(false);
    const preferredWidth = useRef(DEFAULT_WIDTH);
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [resizing, setResizing] = useState(false);

    const clamp = useCallback((next: number) => {
        return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next));
    }, [MIN_WIDTH, MAX_WIDTH]);

    useEffect(() => {
        const parent = panel.current?.parentElement;
        if (!parent) return;
        const resize = () => {
            // Constrain only the displayed width; keep the preference across monitors.
            setWidth(Math.min(preferredWidth.current, parent.clientWidth || preferredWidth.current));
        };
        resize();
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
        observer?.observe(parent);
        window.addEventListener("resize", resize);
        return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const restore = async () => {
            let raw = await getAppMetadata(WIDTH_KEY);
            let migrated = false;
            if (raw === null) {
                const legacy = Number(await getAppMetadata(LEGACY_WIDTH_KEY));
                const parentWidth = panel.current?.parentElement?.clientWidth;
                if (Number.isFinite(legacy) && legacy > 0 && parentWidth) {
                    raw = String(clamp(parentWidth * legacy / 100));
                    migrated = true;
                }
            }
            const saved = Number(raw);
            if (!cancelled && !interacted.current && raw !== null && Number.isFinite(saved) && saved > 0) {
                preferredWidth.current = clamp(saved);
                setWidth(Math.min(preferredWidth.current, panel.current?.parentElement?.clientWidth || preferredWidth.current));
                if (migrated) await setAppMetadata(WIDTH_KEY, String(preferredWidth.current));
            }
        };
        void restore().catch(() => {});
        return () => { cancelled = true; };
    }, [WIDTH_KEY, LEGACY_WIDTH_KEY, clamp]);

    const finishDrag = useCallback((pointerId?: number) => {
        const active = drag.current;
        if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
        drag.current = null;
        setResizing(false);
        if (active.handle.hasPointerCapture?.(active.pointerId)) active.handle.releasePointerCapture(active.pointerId);
        // Pointer resizing must not leave the keyboard focus highlight behind.
        if (document.activeElement === active.handle) active.handle.blur();
        void setAppMetadata(WIDTH_KEY, String(preferredWidth.current)).catch(() => {});
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

    const update = (next: number) => {
        interacted.current = true;
        preferredWidth.current = clamp(next);
        setWidth(Math.min(preferredWidth.current, panel.current?.parentElement?.clientWidth || preferredWidth.current));
    };
    const save = () => { void setAppMetadata(WIDTH_KEY, String(preferredWidth.current)).catch(() => {}); };
    const dimensions = () => {
        const element = panel.current;
        const parent = element?.parentElement;
        if (!element || !parent || !parent.clientWidth) return null;
        const zoom = parent.getBoundingClientRect().width / parent.clientWidth;
        return zoom > 0 ? {zoom, startWidth: element.getBoundingClientRect().width / zoom} : null;
    };

    return <div ref={panel}
        className={`theme-sidebar relative h-full min-h-0 flex-shrink-0 overflow-hidden bg-black flex flex-col ${collapsed && side === "right" ? "border-l border-gray-700 items-center p-2" : ""}`}
        style={{width: collapsed ? collapsedWidth : width, minWidth: collapsed ? collapsedWidth : `min(${MIN_WIDTH}px, 100%)`, maxWidth: collapsed ? collapsedWidth : `min(${MAX_WIDTH}px, 100%)`, userSelect: resizing ? "none" : undefined}}
    >
        {children}
        {!collapsed && <div role="separator" aria-label={`Resize ${side} sidebar`} aria-orientation="vertical"
            aria-valuemin={Math.min(MIN_WIDTH, width)} aria-valuemax={MAX_WIDTH} aria-valuenow={Math.round(width)} aria-valuetext={`${Math.round(width)} pixels wide`}
            title={`Drag to resize ${side} sidebar`}
            onClick={event => event.stopPropagation()}
            tabIndex={0}
            className={`absolute inset-y-0 ${side === "right" ? "left-0" : "right-0"} z-20 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-[var(--tt-accent)]/60 focus-visible:bg-[var(--tt-accent)]/60 focus-visible:outline-none ${resizing ? "bg-[var(--tt-accent)]/60" : ""}`}
            onPointerDown={event => {
                if (event.button !== 0) return;
                const size = dimensions();
                if (!size) return;
                event.preventDefault();
                event.currentTarget.blur();
                event.currentTarget.setPointerCapture(event.pointerId);
                interacted.current = true;
                drag.current = {handle: event.currentTarget, pointerId: event.pointerId, startX: event.clientX, ...size};
                setResizing(true);
            }}
            onPointerMove={event => {
                const active = drag.current;
                if (!active || event.pointerId !== active.pointerId) return;
                if (event.buttons === 0) { finishDrag(event.pointerId); return; }
                update(active.startWidth + (active.startX - event.clientX) / active.zoom * (side === "right" ? 1 : -1));
            }}
            onPointerUp={event => finishDrag(event.pointerId)}
            onPointerCancel={event => finishDrag(event.pointerId)}
            onLostPointerCapture={event => finishDrag(event.pointerId)}
            onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                const size = dimensions();
                if (!size) return;
                event.preventDefault();
                update(event.key === "Home" ? MIN_WIDTH : event.key === "End" ? MAX_WIDTH : width + (event.key === "ArrowLeft" ? 10 : -10) * (side === "right" ? 1 : -1));
                save();
            }}
        />}
    </div>;
}
