/* @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, expect, it, vi} from "vitest";
const api=vi.hoisted(()=>({get:vi.fn(),set:vi.fn()}));
vi.mock("../api/notes.ts",()=>({getNotesState:api.get,setNotesText:api.set}));
vi.mock("../Componants/Toast.tsx",()=>({useToast:()=>({showToast:vi.fn()})}));
import Notes from "./Notes";
import {NOTES_QUERY_KEY} from "../hooks/useNotesState";
afterEach(()=>{cleanup();vi.clearAllMocks();});
function setup() {
    api.get.mockResolvedValue({enabled:true,text:"Original"});
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const view=render(<QueryClientProvider client={client}><Notes/></QueryClientProvider>);
    return {client,...view};
}
it("saves rapid edits in order even when Notes is immediately closed",async()=>{
    let complete!:(text:string)=>void;
    api.set.mockImplementationOnce(()=>new Promise<string>(resolve=>{complete=resolve;})).mockImplementation(async(text:string)=>text);
    const view=setup();const editor=screen.getByRole("textbox");
    await waitFor(()=>expect(editor.textContent).toBe("Original"));
    editor.innerHTML="<p>First</p>";fireEvent.input(editor);
    editor.innerHTML="<p>Second</p>";fireEvent.input(editor);
    view.unmount();
    await waitFor(()=>expect(api.set).toHaveBeenCalledTimes(1));
    await act(async()=>complete("<!--time-tracker-rich-notes--><p>First</p>"));
    await waitFor(()=>expect(api.set).toHaveBeenCalledTimes(2));
    expect(api.set.mock.calls[1]).toEqual(["<!--time-tracker-rich-notes--><p>Second</p>","<!--time-tracker-rich-notes--><p>First</p>"]);
});
it("displays synced notes while focused and retains a conflict returned by local storage",async()=>{
    const {client}=setup();const editor=screen.getByRole("textbox");
    await waitFor(()=>expect(editor.textContent).toBe("Original"));editor.focus();
    act(()=>client.setQueryData(NOTES_QUERY_KEY,{enabled:true,text:"Remote edit"}));
    await waitFor(()=>expect(editor.textContent).toBe("Remote edit"));
    api.set.mockResolvedValue("<!--time-tracker-rich-notes--><p>Remote edit</p><p>Local edit</p>");
    editor.innerHTML="<p>Local edit</p>";fireEvent.input(editor);
    await waitFor(()=>expect(editor.textContent).toBe("Remote editLocal edit"));
    expect(api.set).toHaveBeenCalledWith("<!--time-tracker-rich-notes--><p>Local edit</p>","Remote edit");
});
