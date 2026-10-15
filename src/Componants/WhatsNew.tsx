import {useEffect, useRef, useState} from "react";
import changelog from "../../CHANGELOG.md?raw";
import {createPortal} from "react-dom";

// What's New is read from GitHub first, so notes can be corrected after a release ships.
export const REMOTE_CHANGELOG_URL = "https://raw.githubusercontent.com/Tariq-Sekhri/time_tracker/master/CHANGELOG.md";

const parseReleases = (text: string) => [...text.replace(/\r\n/g, "\n").matchAll(/## \[([0-9]+\.[0-9]+\.[0-9]+)\][^\n]*\n([\s\S]*?)(?=\n## |$)/g)]
    .map((match) => ({version: match[1], notes: match[2].trim().split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim())}));
// The newest release in the bundled changelog is the version of this build.
const current = parseReleases(changelog)[0];
const storageKey = "time-tracker:changelog-seen";
const seenValue = (notes: string[]) => `${current.version}\n${notes.join("\n")}`;

async function latestNotes(): Promise<string[]> {
    if (import.meta.env.VITE_DEMO === "true") return current.notes;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(REMOTE_CHANGELOG_URL, {cache: "no-store", signal: controller.signal});
        if (!response.ok) return current.notes;
        const remote = parseReleases(await response.text()).find((release) => release.version === current.version);
        return remote?.notes.length ? remote.notes : current.notes;
    } catch {
        return current.notes;
    } finally {
        clearTimeout(timeout);
    }
}

function alreadySeen(notes: string[]): boolean {
    try {
        const seen = localStorage.getItem(storageKey);
        // Older builds stored only the version; that covers the notes bundled with it.
        return seen === seenValue(notes) || (seen === current.version && notes.join("\n") === current.notes.join("\n"));
    } catch {
        return true;
    }
}

export default function WhatsNew() {
    const [notes, setNotes] = useState<string[] | null>(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!current) return;
        let cancelled = false;
        void latestNotes().then((latest) => {
            if (cancelled || !latest.length) return;
            setNotes(latest);
            // Edited notes for this version are shown again, even after an earlier dismissal.
            setOpen(!alreadySeen(latest));
        });
        return () => {cancelled = true;};
    }, []);
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => previous?.focus();
    }, [open]);
    if (!open || !notes) return null;
    const dismiss = () => {
        try { localStorage.setItem(storageKey, seenValue(notes)); } catch { /* Still allow dismissal. */ }
        setOpen(false);
    };
    return createPortal(<div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-6">
        <section role="dialog" aria-modal="true" aria-labelledby="whats-new-title"
            className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-950 p-6 text-white shadow-2xl"
            onKeyDown={(event) => {
                if (event.key === "Escape") dismiss();
                if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
            }}>
            <h2 id="whats-new-title" className="text-xl font-semibold">What's new</h2>
            <div className="max-h-[60vh] overflow-y-auto">
                <div className="mt-4">
                    <p className="text-sm text-sky-400">Version {current.version}</p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-200">
                        {notes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                </div>
            </div>
            <div className="mt-6 flex justify-end">
                <button ref={closeRef} onClick={dismiss} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500">Got it</button>
            </div>
        </section>
    </div>, document.body);
}
