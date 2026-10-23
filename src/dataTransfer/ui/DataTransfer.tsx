import {useState} from "react";
import ExportView from "./ExportView.tsx";
import ImportView from "./ImportView.tsx";
import {IconDownload, IconUpload} from "./icons.tsx";
import "./dataTransfer.css";

export default function DataTransfer() {
    const [view, setView] = useState<"export" | "import">("export");
    return <div className="dt-root">
        <header className="dt-header"><div><h2>Import &amp; export</h2><p>Your time, ready for reports, spreadsheets, and moving between tools.</p></div>
            <div className="dt-segmented" role="tablist" aria-label="Data transfer">
                {(["export", "import"] as const).map(item => <button key={item} id={`dt-tab-${item}`} type="button" role="tab"
                    aria-selected={view === item} aria-controls={`dt-view-${item}`} tabIndex={view === item ? 0 : -1}
                    onKeyDown={event => {if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {event.preventDefault(); event.stopPropagation(); const next = event.key === "Home" ? "export" : event.key === "End" ? "import" : view === "export" ? "import" : "export"; setView(next); document.getElementById(`dt-tab-${next}`)?.focus();}}}
                    onClick={() => setView(item)}>{item === "export" ? <IconDownload /> : <IconUpload />}{item === "export" ? "Export" : "Import"}</button>)}
            </div>
        </header>
        <div role="tabpanel" id="dt-view-export" aria-labelledby="dt-tab-export" hidden={view !== "export"}><ExportView /></div>
        <div role="tabpanel" id="dt-view-import" aria-labelledby="dt-tab-import" hidden={view !== "import"}><ImportView /></div>
    </div>;
}
