// @vitest-environment jsdom
import {useState} from "react";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, expect, it} from "vitest";
import MatchPatternField from "./MatchPatternField.tsx";
import {literalMatchPattern} from "../utils/matchPattern.ts";

function Harness({initial = "", newRule = false}: {initial?: string; newRule?: boolean}) {
    const [pattern, setPattern] = useState(initial);
    return <><MatchPatternField value={pattern} onChange={setPattern} newRule={newRule} /><output data-testid="saved">{pattern}</output></>;
}
afterEach(cleanup);

it("defaults new rules to literal text, including punctuation and prefixes", () => {
    render(<Harness newRule />);
    fireEvent.change(screen.getByRole("textbox", {name: "Text to match"}), {target: {value: "T3 Code (Beta)"}});
    const pattern = screen.getByTestId("saved").textContent!;
    expect(pattern).toBe(String.raw`T3 Code \(Beta\)`);
    expect(new RegExp(pattern).test("Project - Thread - T3 Code (Beta)")).toBe(true);
    expect(new RegExp(pattern).test("T3 Code Beta")).toBe(false);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("T3 Code (Beta)");
});

it("preserves existing regex and explains its meaning before editing", () => {
    const initial = String.raw`^T3 Code \(Beta\)$`;
    render(<Harness initial={initial} />);
    expect((screen.getByRole("textbox", {name: "Regex pattern"}) as HTMLInputElement).value).toBe(initial);
    expect(screen.getByRole("note").textContent).toContain("Parentheses group text");
    expect(screen.getByTestId("saved").textContent).toBe(initial);
});

it("lets users turn an accidental regex into literal text and switch back without changing the match", () => {
    render(<Harness initial="T3 Code (Beta)" />);
    fireEvent.change(screen.getByRole("combobox", {name: "Match using"}), {target: {value: "text"}});
    expect(screen.getByTestId("saved").textContent).toBe(literalMatchPattern("T3 Code (Beta)"));
    fireEvent.change(screen.getByRole("combobox", {name: "Match using"}), {target: {value: "regex"}});
    expect(screen.getByTestId("saved").textContent).toBe(literalMatchPattern("T3 Code (Beta)"));
    expect(screen.getByRole("note")).toBeTruthy();
});

it("matches other special characters as ordinary text", () => {
    const text = String.raw`C:\apps\[test] {a}+b?.*$^|`;
    const pattern = literalMatchPattern(text);
    expect(new RegExp(pattern).test(`prefix ${text} suffix`)).toBe(true);
    expect(new RegExp(pattern).test("something unrelated")).toBe(false);
});


it("reopens a saved literal rule as readable text", () => {
    render(<Harness initial={literalMatchPattern("T3 Code (Beta)")} />);
    expect((screen.getByRole("textbox", {name: "Text to match"}) as HTMLInputElement).value).toBe("T3 Code (Beta)");
    expect(screen.queryByRole("note")).toBeNull();
});
