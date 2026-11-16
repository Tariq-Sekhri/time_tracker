import {useId, useState, type InputHTMLAttributes, type Ref} from "react";
import {literalMatchPattern, literalPatternText} from "../utils/matchPattern.ts";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
    value: string;
    onChange: (pattern: string) => void;
    newRule?: boolean;
    inputRef?: Ref<HTMLInputElement>;
};

export default function MatchPatternField({value, onChange, newRule = false, inputRef, className, ...inputProps}: Props) {
    const id = useId();
    // Only show an existing pattern as text when its literal meaning is provable.
    const [mode, setMode] = useState<"text" | "regex">(newRule || literalPatternText(value) != null ? "text" : "regex");
    const text = mode === "text" ? literalPatternText(value) ?? value : value;
    return <div className="min-w-0 flex-1 basis-72 space-y-1.5">
        <div className="flex items-center gap-2">
            <label className="shrink-0">
                <span className="sr-only">Match using</span>
                <select aria-label="Match using" value={mode} disabled={inputProps.disabled}
                    onChange={(event) => {
                        const next = event.target.value as "text" | "regex";
                        if (next === "text") onChange(literalMatchPattern(literalPatternText(value) ?? value));
                        setMode(next);
                    }} className="h-[42px] rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500">
                    <option value="text">Contains text</option>
                    <option value="regex">Regex (advanced)</option>
                </select>
            </label>
            <label htmlFor={id} className="sr-only">{mode === "text" ? "Text to match" : "Regex pattern"}</label>
            <input {...inputProps} id={id} ref={inputRef} type="text" value={text}
                aria-label={mode === "text" ? "Text to match" : "Regex pattern"}
                aria-describedby={mode === "regex" ? `${id}-help` : undefined}
                placeholder={mode === "text" ? "Text to match (e.g. T3 Code (Beta))" : "Regex pattern"}
                onChange={(event) => onChange(mode === "text" ? literalMatchPattern(event.target.value) : event.target.value)}
                className={`h-[42px] min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500 ${className ?? ""}`} />
        </div>
        {mode === "regex" && <p id={`${id}-help`} role="note"
            className="text-sm rounded border border-amber-700/60 bg-amber-950/30 p-2 text-amber-200">
            Regex: punctuation changes the match. Parentheses group text instead of matching literal parentheses. Choose Contains text for ordinary names. <code>^</code> and <code>$</code> anchor the start and end of the title.
        </p>}
    </div>;
}
