import {useEffect, useRef, useState} from "react";
import changelog from "../../CHANGELOG.md?raw";
import {createPortal} from "react-dom";

const releases = [...changelog.matchAll(/## \[([0-9]+\.[0-9]+\.[0-9]+)\][^\n]*\n([\s\S]*?)(?=\n## |$)/g)]
    .map((match) => ({version: match[1], notes: match[2].trim().split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2))}));
const storageKey = "time-tracker:changelog-seen";

export default function WhatsNew() {
    const [open, setOpen] = useState(() => {
        try { return releases.length > 0 && localStorage.getItem(storageKey) !== releases[0].version; }
        catch { return false; }
    });
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => previous?.focus();
    }, [open]);
    if (!open) return null;
    let seen: string | null = null;
    try { seen = localStorage.getItem(storageKey); } catch { /* Storage can be unavailable. */ }
    const seenIndex = releases.findIndex((release) => release.version === seen);
    const visible = seenIndex > 0 ? releases.slice(0, seenIndex) : releases.slice(0, 1);
    const dismiss = () => {
        try { localStorage.setItem(storageKey, releases[0].version); } catch { /* Still allow dismissal. */ }
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
                {visible.map((release) => <div key={release.version} className="mt-4">
                    <p className="text-sm text-sky-400">Version {release.version}</p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-200">
                        {release.notes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                </div>)}
            </div>
            <div className="mt-6 flex justify-end">
                <button ref={closeRef} onClick={dismiss} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500">Got it</button>
            </div>
        </section>
    </div>, document.body);
}
