import {literalPatternText} from "../utils/matchPattern.ts";

export default function MatchPatternSummary({pattern}: {pattern: string}) {
    const literal = literalPatternText(pattern);
    return <span className="inline-flex flex-wrap items-center gap-2 text-sm">
        <span className={literal == null ? "text-amber-300" : "text-gray-400"}>{literal == null ? "Regex" : "Contains text"}</span>
        <code className="break-all text-gray-200">{literal ?? pattern}</code>
    </span>;
}
