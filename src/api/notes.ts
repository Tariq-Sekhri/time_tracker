import { invokeOrThrow } from "../utils.ts";

export type NotesState = {
    enabled: boolean;
    text: string;
};

export function getNotesState(): Promise<NotesState> {
    return invokeOrThrow<NotesState>("get_notes_state");
}

export function setNotesEnabled(enabled: boolean): Promise<void> {
    return invokeOrThrow("set_notes_enabled", { enabled });
}

export function setNotesText(text: string): Promise<void> {
    return invokeOrThrow("set_notes_text", { text });
}
