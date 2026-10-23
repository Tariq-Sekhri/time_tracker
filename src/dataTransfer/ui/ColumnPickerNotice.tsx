import {Banner} from "./common.tsx";

export default function ColumnPickerNotice({onSelectAll}: {onSelectAll: () => void}) {
    return <Banner tone="info">JSON contains only the datasets you selected. To restore tracked activity, include raw activity logs and devices; activity sessions are a report view.
        <button type="button" className="dt-button" onClick={onSelectAll}>Include everything</button>
    </Banner>;
}
