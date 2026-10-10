import {formatDuration} from "./utils.ts";
import {useState} from "react";

type DonutItem = { label: string; value: number; color: string };

export function DonutChart({data, colors, totalDuration, periodLabel = "this week"}: {
    data: DonutItem[];
    colors: Map<string, string>;
    totalDuration?: number;
    periodLabel?: string;
}) {
    const [hoveredItem, setHoveredItem] = useState<DonutItem | null>(null);
    const positive = data.filter((item) => item.value > 0);
    const total = positive.reduce((sum, item) => sum + item.value, 0);
    const percentageTotal = totalDuration ?? total;
    const describeItem = (item: DonutItem) => {
        const minutes = (item.value / 60).toLocaleString(undefined, {maximumFractionDigits: 1});
        const percentage = percentageTotal > 0 ? (item.value / percentageTotal) * 100 : 0;
        return `${minutes} min · ${percentage.toFixed(1)}% of ${periodLabel}`;
    };
    const segmentProps = (item: DonutItem) => ({
        tabIndex: 0,
        role: "img",
        "aria-label": `${item.label}: ${describeItem(item)}`,
        onMouseEnter: () => setHoveredItem(item),
        onMouseLeave: () => setHoveredItem(null),
        onFocus: () => setHoveredItem(item),
        onBlur: () => setHoveredItem(null),
    });
    const tooltip = hoveredItem && positive.includes(hoveredItem) ? (
        <div role="tooltip" className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 max-w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-center text-xs text-white shadow-lg pointer-events-none">
            <div className="font-semibold break-words">{hoveredItem.label}</div>
            <div className="whitespace-nowrap text-gray-300">{describeItem(hoveredItem)}</div>
        </div>
    ) : null;
    if (total === 0) {
        return (
            <div className="w-full h-48 flex items-center justify-center text-gray-500">
                No data
            </div>
        );
    }

    const radius = 60;
    const centerX = 80;
    const centerY = 80;
    const innerR = radius * 0.6;

    if (positive.length === 1) {
        const item = positive[0];
        const fill = item.color || colors.get(item.label) || "#6b7280";
        return (
            <div className="relative w-full flex justify-center">
                <svg width="160" height="160" viewBox="0 0 160 160">
                    <circle {...segmentProps(item)} cx={centerX} cy={centerY} r={radius} fill={fill} className="hover:opacity-80 transition-opacity" />
                    <circle cx={centerX} cy={centerY} r={innerR} fill="#111827"/>
                    <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="14"
                          fontWeight="bold">
                        {formatDuration(total)}
                    </text>
                </svg>
                {tooltip}
            </div>
        );
    }

    let currentAngle = -90;

    const paths = positive.map((item, index) => {
        const percentage = (item.value / total) * 100;
        const angle = (percentage / 100) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;

        const x1 = centerX + radius * Math.cos((startAngle * Math.PI) / 180);
        const y1 = centerY + radius * Math.sin((startAngle * Math.PI) / 180);
        const x2 = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
        const y2 = centerY + radius * Math.sin((endAngle * Math.PI) / 180);

        const largeArcFlag = angle > 180 ? 1 : 0;

        const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

        currentAngle += angle;

        return (
            <path
                {...segmentProps(item)}
                key={index}
                d={pathData}
                fill={item.color || colors.get(item.label) || "#6b7280"}
                className="hover:opacity-80 transition-opacity"
            />
        );
    });

    return (
        <div className="relative w-full flex justify-center">
            <svg width="160" height="160" viewBox="0 0 160 160">
                {paths}
                <circle cx={centerX} cy={centerY} r={innerR} fill="#111827"/>
                <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="14"
                      fontWeight="bold">
                    {formatDuration(total)}
                </text>
            </svg>
            {tooltip}
        </div>
    );
}
