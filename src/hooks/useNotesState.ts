import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotesState, setNotesEnabled, type NotesState } from "../api/notes.ts";

export const NOTES_QUERY_KEY = ["notes"];

export function useNotesState() {
    const queryClient = useQueryClient();
    const { data } = useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: getNotesState });

    const setEnabled = async (enabled: boolean) => {
        const previous = queryClient.getQueryData<NotesState>(NOTES_QUERY_KEY);
        queryClient.setQueryData<NotesState>(NOTES_QUERY_KEY, {
            enabled,
            text: previous?.text ?? "",
        });
        try {
            await setNotesEnabled(enabled);
        } catch (error) {
            queryClient.setQueryData(NOTES_QUERY_KEY, previous);
            throw error;
        }
    };

    return { enabled: data?.enabled ?? false, setEnabled };
}
