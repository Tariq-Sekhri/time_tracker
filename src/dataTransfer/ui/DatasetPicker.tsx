import type {ExportInclude} from "../../api/dataTransfer.ts";
import {CheckMark, formatCount} from "./common.tsx";
import {DATASET_ICONS, Spinner} from "./icons.tsx";
import {DATASETS, LARGE_LOG_COUNT, type DatasetCounts} from "./scope.ts";

/** "What to export": one selectable card per dataset with a live count badge. */
export default function DatasetPicker({include, counts, loading, onChange}: {
    include: ExportInclude;
    counts: DatasetCounts;
    /** Counts are being refreshed. */
    loading: boolean;
    onChange: (include: ExportInclude) => void;
}) {
    return <div className="dt-dataset-grid" role="group" aria-label="Datasets to export" aria-busy={loading}>
        {DATASETS.map((item) => {
            const Icon = DATASET_ICONS[item.key];
            const selected = include[item.key];
            // Logs are only counted once selected, because the count means fetching them.
            const count = item.key === "activity_logs" && !selected ? undefined : counts[item.key];
            const large = item.key === "activity_logs" && (count ?? 0) > LARGE_LOG_COUNT;
            return <label key={item.key} className="dt-dataset-card" data-selected={selected}>
                <input type="checkbox" checked={selected} aria-describedby={`dt-dataset-${item.key}-desc`}
                    onChange={(event) => onChange({...include, [item.key]: event.target.checked})} />
                <span className="dt-dataset-icon"><Icon /></span>
                <span className="dt-dataset-text">
                    <strong>{item.label}{item.advanced && <span className="dt-badge">Advanced</span>}</strong>
                    <p id={`dt-dataset-${item.key}-desc`}>{item.description}</p>
                    {large && <p style={{color: "var(--tt-warning)"}}>Large export — this may take a while and produce a big file.</p>}
                </span>
                <span className="dt-dataset-meta">
                    <CheckMark />
                    <span className={`dt-badge${large ? " dt-badge-warning" : selected ? " dt-badge-accent" : ""}`}
                        title={count == null ? (item.key === "activity_logs" ? "Counted when selected" : "Counting…") : `${formatCount(count)} in range`}>
                        {loading && count == null ? <Spinner className="dt-spinner dt-icon-sm" /> : formatCount(count)}
                    </span>
                </span>
            </label>;
        })}
    </div>;
}
