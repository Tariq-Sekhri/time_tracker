import {formatDuration} from "./utils.ts";

export function DonutChart({data, colors}: {
    data: { label: string; value: number; color: string }[];
    colors: Map<string, string>
}) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
        return (
            <div className="w-full h-48 flex items-center justify-center text-gray-500">
                No data
            </div>
        );
    }

    let currentAngle = -90; // Start at top
    const radius = 60;
    const centerX = 80;
    const centerY = 80;

    const paths = data.map((item, index) => {
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
                key={index}
                d={pathData}
                fill={item.color || colors.get(item.label) || "#6b7280"}
                className="hover:opacity-80 transition-opacity"
            />
        );
    });

    return (
        <div className="w-full flex justify-center">
            <svg width="160" height="160" viewBox="0 0 160 160">
                {paths}
                <circle cx={centerX} cy={centerY} r={radius * 0.6} fill="#111827"/>
                <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="14"
                      fontWeight="bold">
                    {formatDuration(total)}
                </text>
            </svg>
        </div>
    );
}