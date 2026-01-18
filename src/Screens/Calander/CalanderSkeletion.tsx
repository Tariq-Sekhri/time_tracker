export default function CalendarSkeleton() {
    const hours = Array.from({length: 24}, (_, i) => i);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="animate-pulse">
            <div className="flex border-b border-gray-700 mb-2">
                <div className="w-16 bg-gray-700"></div>
                {days.map((day) => (
                    <div key={day} className="flex-1 text-center py-3">
                        <div className="h-4 bg-gray-700 rounded w-8 mx-auto mb-1"></div>
                        <div className="h-6 bg-gray-700 rounded w-6 mx-auto"></div>
                    </div>
                ))}
            </div>
            <div className="relative">
                {hours.slice(0, 12).map((hour) => (
                    <div key={hour} className="flex border-b border-gray-800 h-12">
                        <div className="w-16 text-right pr-2 text-xs text-gray-600">
                            {hour}:00
                        </div>
                        {days.map((day) => (
                            <div key={`${day}-${hour}`} className="flex-1 border-l border-gray-800">
                                {Math.random() > 0.85 && (
                                    <div
                                        className="bg-gray-700 rounded mx-1 mt-1"
                                        style={{height: `${20 + Math.random() * 30}px`}}
                                    ></div>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
