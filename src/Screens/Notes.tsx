import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotesState, setNotesText } from "../api/notes.ts";
import { NOTES_QUERY_KEY } from "../hooks/useNotesState.ts";
import { useToast } from "../Componants/Toast.tsx";
import { toErrorString } from "../types/common.ts";

const RICH_NOTES_PREFIX = "<!--time-tracker-rich-notes-->";
const ALLOWED_TAGS = new Set(["P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "A", "IMG"]);

function sanitizeRichHtml(html: string): string {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const cleanNode = (node: Node): Node[] => {
        if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.textContent ?? "")];
        if (!(node instanceof HTMLElement) || !ALLOWED_TAGS.has(node.tagName)) {
            return Array.from(node.childNodes).flatMap(cleanNode);
        }
        const clean = document.createElement(node.tagName.toLowerCase());
        if (node.tagName === "A") {
            const href = node.getAttribute("href") ?? "";
            if (/^(https?:|mailto:)/i.test(href)) {
                clean.setAttribute("href", href);
                clean.setAttribute("target", "_blank");
                clean.setAttribute("rel", "noopener noreferrer");
            }
        }
        if (node.tagName === "IMG") {
            const src = node.getAttribute("src") ?? "";
            if (!/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+=*$/i.test(src) || src.length > 5_600_000) return [];
            clean.setAttribute("src", src);
            clean.setAttribute("alt", node.getAttribute("alt") ?? "Pasted image");
            clean.setAttribute("class", "notes-image");
            return [clean];
        }
        clean.append(...Array.from(node.childNodes).flatMap(cleanNode));
        return [clean];
    };
    const root = document.createElement("div");
    root.append(...Array.from(parsed.body.childNodes).flatMap(cleanNode));
    return root.innerHTML;
}

function toEditorHtml(value: string): string {
    return value.startsWith(RICH_NOTES_PREFIX) ? sanitizeRichHtml(value.slice(RICH_NOTES_PREFIX.length)) : value
        ? `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`
        : "";
}

export default function Notes() {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const { data } = useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: getNotesState, refetchInterval: 5000 });
    const editorRef = useRef<HTMLDivElement>(null);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const saveVersion = useRef(0);
    const loadedText = useRef("");
    const pendingSave = useRef(false);
    const [saveStatus, setSaveStatus] = useState("Saved");

    useEffect(() => {
        if (editorRef.current && !pendingSave.current && data && loadedText.current !== data.text) {
            loadedText.current = data.text;
            editorRef.current.innerHTML = toEditorHtml(data.text);
        }
    }, [data?.text]);

    const save = useCallback((html: string) => {
        const version = ++saveVersion.current;
        const nextText = `${RICH_NOTES_PREFIX}${sanitizeRichHtml(html)}`;
        const expectedText = loadedText.current;
        loadedText.current = nextText;
        pendingSave.current = true;
        setSaveStatus("Saving...");
        // Persist every edit in order, including edits immediately before leaving Notes.
        saveQueue.current = saveQueue.current.catch(() => {}).then(() => setNotesText(nextText, expectedText))
            .then((savedText) => {
                if (version === saveVersion.current) {
                    pendingSave.current = false;
                    const canonicalText = savedText ?? nextText;
                    loadedText.current = canonicalText;
                    if (canonicalText !== nextText && editorRef.current) editorRef.current.innerHTML = toEditorHtml(canonicalText);
                    queryClient.setQueryData(NOTES_QUERY_KEY, (previous: { enabled: boolean; text: string } | undefined) => ({
                        enabled: previous?.enabled ?? true,
                        text: canonicalText,
                    }));
                    setSaveStatus("Saved");
                }
            })
            .catch((error) => {
                if (version === saveVersion.current) { pendingSave.current = false; setSaveStatus("Save failed"); }
                showToast("Could not save notes", "error", 5000, toErrorString(error));
            });
    }, [queryClient, showToast]);

    const format = (command: string, value?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
        if (editorRef.current) save(editorRef.current.innerHTML);
    };

    const copyImage = async (img: HTMLImageElement) => {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext("2d")?.drawImage(img, 0, 0);
            const blob = await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/png"));
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch (error) {
            showToast("Could not copy image", "error", 5000, toErrorString(error));
        }
    };

    const selectImage = (img: HTMLImageElement | null) => {
        editorRef.current?.querySelectorAll("img.selected").forEach((el) => el.classList.remove("selected"));
        img?.classList.add("selected");
    };

    const insertImage = (file: File) => {
        if (!file.type.startsWith("image/")) return;
        if (file.size > 4 * 1024 * 1024) {
            showToast("Image is too large", "error", 5000, "Paste an image smaller than 4 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const src = String(reader.result ?? "");
            if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) {
                showToast("Unsupported image", "error", 5000, "Use a PNG, JPEG, GIF, or WebP image.");
                return;
            }
            editorRef.current?.focus();
            document.execCommand("insertHTML", false, `<img class="notes-image" alt="Pasted image" src="${src}">`);
            if (editorRef.current) save(editorRef.current.innerHTML);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex h-full min-h-0 flex-col p-6">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold">Notes</h1>
                <span className="text-xs text-gray-400" aria-live="polite">{saveStatus}</span>
            </div>
            <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-gray-700 bg-gray-900 p-2" role="toolbar" aria-label="Note formatting">
                {([["Bold", "bold"], ["Italic", "italic"], ["Underline", "underline"], ["Bullets", "insertUnorderedList"], ["Numbered list", "insertOrderedList"]] as const).map(([label, command]) => (
                    <button key={command} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format(command)} className="rounded px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 focus-visible:outline focus-visible:outline-blue-400" aria-label={label} title={label}>{label}</button>
                ))}
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                    const href = window.prompt("Link address (https://…)");
                    if (href && /^https?:\/\//i.test(href)) format("createLink", href);
                }} className="rounded px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700">Link</button>
            </div>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Notes editor"
                aria-multiline="true"
                data-placeholder="Write notes about the app… Paste an image to add it."
                onInput={(event) => save(event.currentTarget.innerHTML)}
                onBlur={() => { void saveQueue.current.then(() => queryClient.invalidateQueries({queryKey: NOTES_QUERY_KEY})); }}
                onClick={(event) => selectImage(event.target instanceof HTMLImageElement ? event.target : null)}
                onContextMenu={(event) => {
                    if (!(event.target instanceof HTMLImageElement)) return;
                    event.preventDefault();
                    selectImage(event.target);
                    void copyImage(event.target);
                }}
                onCopy={(event) => {
                    const selection = window.getSelection();
                    const editor = editorRef.current;
                    if (!selection || !editor) return;
                    const selected = editor.querySelector<HTMLImageElement>("img.selected");
                    const images = Array.from(editor.querySelectorAll("img")).filter((img) => !selection.isCollapsed && selection.containsNode(img, true));
                    if (!images.length && selected && !selection.toString()) images.push(selected);
                    if (!images.length) return;
                    event.preventDefault();
                    void copyImage(images[0]);
                }}
                onPaste={(event) => {
                    const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
                    const hasHtmlImage = /<img\b[^>]*src="data:image\//i.test(event.clipboardData.getData("text/html"));
                    if (image && !hasHtmlImage) {
                        event.preventDefault();
                        const file = image.getAsFile();
                        if (file) insertImage(file);
                        return;
                    }
                    event.preventDefault();
                    const html = event.clipboardData.getData("text/html");
                    const plainText = event.clipboardData.getData("text/plain");
                    const safeContent = html
                        ? sanitizeRichHtml(html)
                        : plainText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
                    document.execCommand("insertHTML", false, safeContent);
                    if (editorRef.current) save(editorRef.current.innerHTML);
                }}
                className="notes-editor min-h-64 flex-1 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-4 text-white outline-none focus:border-blue-500"
            />
        </div>
    );
}
