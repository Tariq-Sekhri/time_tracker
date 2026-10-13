import {useLayoutEffect, useRef, useState, type ReactNode} from "react";
import {createPortal} from "react-dom";

export default function ManualPopover({anchor, onClose, labelledBy, children, width = 480, ignoreOutsideSelector, beside = false, positionKey, suspended = false}: {
    anchor: HTMLElement | null;
    onClose: () => void;
    labelledBy: string;
    children: ReactNode;
    width?: number;
    ignoreOutsideSelector?: string;
    beside?: boolean;
    positionKey?: string;
    suspended?: boolean;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({top: 0, left: 0, width, maxHeight: window.innerHeight - 24});
    useLayoutEffect(() => {
        const positionPanel = () => {
            if (!anchor || !panelRef.current) return;
            const zoomStyle = getComputedStyle(document.documentElement).zoom;
            const zoom = (zoomStyle.endsWith("%") ? parseFloat(zoomStyle) / 100 : parseFloat(zoomStyle)) || 1;
            const rect = anchor.getBoundingClientRect();
            const viewWidth = window.innerWidth / zoom;
            const viewHeight = window.innerHeight / zoom;
            const panelWidth = Math.min(width, viewWidth - 24);
            const maxHeight = Math.max(0, viewHeight - 24);
            const panelHeight = Math.min(panelRef.current.getBoundingClientRect().height / zoom, maxHeight);
            const below = rect.bottom / zoom + 8;
            const above = rect.top / zoom - panelHeight - 8;
            setPosition({
                top: beside ? Math.max(12, Math.min(rect.top / zoom, viewHeight - panelHeight - 12)) : below + panelHeight <= viewHeight - 12 ? below : Math.max(12, above),
                left: beside ? Math.max(12, Math.min(rect.right / zoom + panelWidth + 8 <= viewWidth - 12 ? rect.right / zoom + 8 : rect.left / zoom - panelWidth - 8, viewWidth - panelWidth - 12)) : Math.max(12, Math.min(rect.right / zoom - panelWidth, viewWidth - panelWidth - 12)),
                width: panelWidth,
                maxHeight,
            });
        };
        positionPanel();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(positionPanel) : null;
        if (panelRef.current) observer?.observe(panelRef.current);
        if (anchor) observer?.observe(anchor);
        observer?.observe(document.documentElement);
        const zoomObserver = new MutationObserver(positionPanel);
        zoomObserver.observe(document.documentElement, {attributes: true, attributeFilter: ["style"]});
        window.addEventListener("resize", positionPanel);
        window.addEventListener("scroll", positionPanel, true);
        return () => {
            observer?.disconnect();
            zoomObserver.disconnect();
            window.removeEventListener("resize", positionPanel);
            window.removeEventListener("scroll", positionPanel, true);
        };
    }, [anchor, width, beside, positionKey]);

    useLayoutEffect(() => {
        const onOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element) || target.closest("[data-manual-popover]") || (ignoreOutsideSelector && target.closest(ignoreOutsideSelector)) || anchor?.contains(target)) return;
            onClose();
        };
        document.addEventListener("pointerdown", onOutside);
        return () => document.removeEventListener("pointerdown", onOutside);
    }, [anchor, onClose, ignoreOutsideSelector]);

    return createPortal(<div
        ref={panelRef}
        role="dialog"
        aria-labelledby={labelledBy}
        data-manual-popover
        style={{...position, visibility: suspended ? "hidden" : undefined, pointerEvents: suspended ? "none" : undefined}}
        className="fixed z-[300] overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 p-5 text-white shadow-2xl shadow-black/70 nice-scrollbar"
        onKeyDown={(event) => {
            if (event.key === "Escape") {event.stopPropagation(); onClose(); anchor?.focus();}
        }}
    >{children}</div>, document.body);
}
