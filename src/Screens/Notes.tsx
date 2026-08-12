import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotesState, setNotesText } from "../api/notes.ts";
import { NOTES_QUERY_KEY } from "../hooks/useNotesState.ts";
import { useToast } from "../Componants/Toast.tsx";
import { toErrorString } from "../types/common.ts";

export default function Notes() {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const { data } = useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: getNotesState });
    const [text, setText] = useState("");
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveVersion = useRef(0);

    useEffect(() => {
        setText(data?.text ?? "");
    }, [data?.text]);

    useEffect(() => () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
    }, []);

    const save = (nextText: string) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const version = ++saveVersion.current;
        saveTimer.current = setTimeout(() => {
            void setNotesText(nextText)
                .then(() => {
                    if (version === saveVersion.current) {
                        queryClient.setQueryData(NOTES_QUERY_KEY, (previous: { enabled: boolean; text: string } | undefined) => ({
                            enabled: previous?.enabled ?? true,
                            text: nextText,
                        }));
                    }
                })
                .catch((error) => showToast("Could not save notes", "error", 5000, toErrorString(error)));
        }, 400);
    };

    return (
        <div className="h-full p-6">
            <h1 className="mb-6 text-2xl font-bold">Notes</h1>
            <textarea
                value={text}
                onChange={(event) => {
                    const nextText = event.target.value;
                    setText(nextText);
                    save(nextText);
                }}
                placeholder="Write notes about the app…"
                className="h-[calc(100%-4rem)] min-h-64 w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-4 text-white outline-none focus:border-blue-500"
            />
        </div>
    );
}
