import {useLayoutEffect, useRef, useState, type ReactNode} from "react";
import {createPortal} from "react-dom";

export default function ManualPopover({anchor, onClose, labelledBy, children, width = 480}: {
    anchor: HTMLElement | null;
    onClose: () => void;
    labelledBy: string;
    children: ReactNode;
    width?: number;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({top: 0, left: 0, width});
    useLayoutEffect(() => {
        const positionPanel = () => {
            if (!anchor || !panelRef.current) return;
            const zoomStyle = getComputedStyle(document.documentElement).zoom;
            const zoom = (zoomStyle.endsWith("%") ? parseFloat(zoomStyle) / 100 : parseFloat(zoomStyle)) || 1;
            const rect = anchor.getBoundingClientRect();
            const viewWidth = window.innerWidth / zoom;
            const viewHeight = window.innerHeight / zoom;
            const panelWidth = Math.min(width, viewWidth - 24);
            const panelHeight = panelRef.current.getBoundingClientRect().height / zoom;
            const below = rect.bottom / zoom + 8;
            const above = rect.top / zoom - panelHeight - 8;
            setPosition({
                top: below + panelHeight <= viewHeight - 12 ? below : Math.max(12, above),
                left: Math.max(12, Math.min(rect.right / zoom - panelWidth, viewWidth - panelWidth - 12)),
                width: panelWidth,
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
    }, [anchor, width]);

    useLayoutEffect(() => {
        const onOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element) || target.closest("[data-manual-popover]") || anchor?.contains(target)) return;
            onClose();
        };
        document.addEventListener("pointerdown", onOutside);
        return () => document.removeEventListener("pointerdown", onOutside);
    }, [anchor, onClose]);

    return createPortal(<div
        ref={panelRef}
        role="dialog"
        aria-labelledby={labelledBy}
        data-manual-popover
        style={{...position, maxHeight: "calc(100vh - 24px)"}}
        className="fixed z-[300] overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 p-5 text-white shadow-2xl shadow-black/70 nice-scrollbar"
        onKeyDown={(event) => {
            if (event.key === "Escape") {event.stopPropagation(); onClose(); anchor?.focus();}
        }}
    >{children}</div>, document.body);
}
