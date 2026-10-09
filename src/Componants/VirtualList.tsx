import {useEffect, useRef, useState, type ReactNode} from "react";

/** Fixed-height, single-line rows. Keep the complete list available without mounting it all. */
export default function VirtualList<T>({items, itemKey, renderItem, rowHeight = 44}: {
    items: T[];
    itemKey: (item: T) => string;
    renderItem: (item: T) => ReactNode;
    rowHeight?: number;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(600);
    const [scrollTop, setScrollTop] = useState(0);
    useEffect(() => {
        const element = viewport.current!;
        const update = () => setHeight(element.clientHeight || 600);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const first = Math.max(0, Math.min(items.length - 1, Math.floor(scrollTop / rowHeight) - 4));
    const last = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + 4);
    return <div ref={viewport} className="min-h-0 flex-1 overflow-y-auto nice-scrollbar"
                tabIndex={0} aria-label="App list" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} data-virtual-list data-virtual-items={items.length}>
        <div className="relative" style={{height: items.length * rowHeight}}>
            {items.slice(first, last).map((item, index) => <div key={itemKey(item)}
                data-virtual-row style={{position: "absolute", top: (first + index) * rowHeight, height: rowHeight, left: 0, right: 0}}>
                {renderItem(item)}
            </div>)}
        </div>
    </div>;
}
