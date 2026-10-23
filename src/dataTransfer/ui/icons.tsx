import type {ReactNode} from "react";
import type {DatasetKey, ExportFormat} from "../types.ts";

/* Inline stroke icons (24px grid), matching the style used across Settings. */

type IconProps = {className?: string};

function Svg({className = "dt-icon", children}: IconProps & {children: ReactNode}) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>;
}

export const IconClock = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IconCalendarBlocks = (p: IconProps) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9h17M8 3v3M16 3v3" /><rect x="7" y="12" width="4" height="5" rx=".8" /><rect x="13" y="12" width="4" height="3" rx=".8" /></Svg>;
export const IconList = (p: IconProps) => <Svg {...p}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r=".8" /><circle cx="4" cy="12" r=".8" /><circle cx="4" cy="18" r=".8" /></Svg>;
export const IconDevice = (p: IconProps) => <Svg {...p}><rect x="3" y="4.5" width="18" height="12" rx="1.8" /><path d="M8.5 20h7M12 16.5V20" /></Svg>;
export const IconTag = (p: IconProps) => <Svg {...p}><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8" cy="8" r="1.4" /></Svg>;
export const IconFolders = (p: IconProps) => <Svg {...p}><path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9.5A1.5 1.5 0 0 0 19.5 8h-7l-2-2.5h-6A1.5 1.5 0 0 0 3 7z" /><path d="M7 13h10" /></Svg>;
export const IconLayers = (p: IconProps) => <Svg {...p}><path d="M12 3 3 8l9 5 9-5z" /><path d="m3 13 9 5 9-5" /></Svg>;
export const IconBan = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Svg>;
export const IconTable = (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9.5h18M3 15h18M9.5 4v16" /></Svg>;
export const IconFileText = (p: IconProps) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Svg>;
export const IconReport = (p: IconProps) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 17v-3M12 17v-5M15 17v-2" /></Svg>;
export const IconBraces = (p: IconProps) => <Svg {...p}><path d="M8 3.5H7a2 2 0 0 0-2 2V10a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4.5a2 2 0 0 0 2 2h1M16 3.5h1a2 2 0 0 1 2 2V10a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4.5a2 2 0 0 1-2 2h-1" /></Svg>;
export const IconUpload = (p: IconProps) => <Svg {...p}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></Svg>;
export const IconDownload = (p: IconProps) => <Svg {...p}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></Svg>;
export const IconEye = (p: IconProps) => <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const IconX = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconChevronDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconArrowUp = (p: IconProps) => <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const IconArrowDown = (p: IconProps) => <Svg {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>;
export const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Svg>;
export const IconWarning = (p: IconProps) => <Svg {...p}><path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></Svg>;
export const IconInfo = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IconFolderOpen = (p: IconProps) => <Svg {...p}><path d="M3 18V6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.5h7A1.5 1.5 0 0 1 20 9v1.5" /><path d="M3 18l2.6-6.4A1.5 1.5 0 0 1 7 10.5h14l-2.7 7.1a1.5 1.5 0 0 1-1.4.9H4.5A1.5 1.5 0 0 1 3 18z" /></Svg>;
export const IconTrash = (p: IconProps) => <Svg {...p}><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></Svg>;
export const IconSave = (p: IconProps) => <Svg {...p}><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></Svg>;

export function Spinner({className = "dt-spinner"}: IconProps) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export const DATASET_ICONS: Record<DatasetKey, (p: IconProps) => ReactNode> = {
    manual_entries: IconClock,
    activity_sessions: IconCalendarBlocks,
    activity_logs: IconList,
    devices: IconDevice,
    activity_categories: IconTag,
    manual_categories: IconFolders,
    app_groups: IconLayers,
    skipped_apps: IconBan,
};

export const FORMAT_ICONS: Record<ExportFormat, (p: IconProps) => ReactNode> = {
    xlsx: IconTable,
    csv: IconFileText,
    pdf: IconReport,
    json: IconBraces,
};
