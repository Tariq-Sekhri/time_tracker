import {radioKeyDown} from "./common.tsx";
import {IconCalendarBlocks} from "./icons.tsx";
import {describeRange, RANGE_PRESETS, rangeError, toDateInput, type RangePreset, type RangeSelection, type ResolvedRange} from "./dateRanges.ts";

/**
 * Preset chips plus two date inputs. The inputs always show the effective range;
 * editing either switches to "Custom" starting from what was shown.
 */
export default function DateRangePicker({value, resolved, onChange}: {
    value: RangeSelection;
    resolved: ResolvedRange | null;
    onChange: (value: RangeSelection) => void;
}) {
    const error = rangeError(value);
    const shownStart = value.preset === "custom" || !resolved ? value.customStart : toDateInput(new Date(resolved.start * 1000));
    const shownEnd = value.preset === "custom" || !resolved ? value.customEnd : toDateInput(new Date((resolved.end - 1) * 1000));
    const choose = (preset: RangePreset) => onChange(preset === "custom" ? {preset, customStart: shownStart, customEnd: shownEnd} : {...value, preset});
    const ids = RANGE_PRESETS.map((item) => item.id);

    return <div className="dt-section" style={{gap: 14}}>
        <div className="dt-chip-row" role="radiogroup" aria-label="Date range presets"
            onKeyDown={(event) => radioKeyDown(event, ids, value.preset, choose, (id) => `dt-range-${id}`)}>
            {RANGE_PRESETS.map((item) => <button key={item.id} id={`dt-range-${item.id}`} type="button" role="radio" className="dt-chip"
                aria-checked={value.preset === item.id} tabIndex={value.preset === item.id ? 0 : -1}
                onClick={() => choose(item.id)}>{item.label}</button>)}
        </div>
        <div className="dt-range-custom">
            <label className="dt-field">
                <span>From</span>
                <input className="dt-input" type="date" value={shownStart} max={shownEnd || undefined} aria-invalid={!!error && value.preset === "custom"}
                    onChange={(event) => onChange({preset: "custom", customStart: event.target.value, customEnd: shownEnd})} />
            </label>
            <label className="dt-field">
                <span>To (inclusive)</span>
                <input className="dt-input" type="date" value={shownEnd} min={shownStart || undefined} aria-invalid={!!error && value.preset === "custom"}
                    onChange={(event) => onChange({preset: "custom", customStart: shownStart, customEnd: event.target.value})} />
            </label>
        </div>
        <div className="dt-range-result" aria-live="polite">
            <IconCalendarBlocks className="dt-icon" />
            {error ? <span style={{color: "var(--tt-danger)"}}>{error}</span>
                : resolved ? <span><strong>{describeRange(resolved).split(" · ")[0]}</strong> · {describeRange(resolved).split(" · ")[1]}</span>
                    : <span>Loading range…</span>}
            {value.preset === "all_time" && <span className="settings-muted">From your first to your latest recorded data.</span>}
        </div>
    </div>;
}
