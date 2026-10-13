import {expect, it} from "vitest";
import {roundDurations} from "./roundDurations";

it("keeps rounded app shares equal to their combined duration", () => {
    const shares = new Map([["a", 10.6], ["b", 20.6], ["c", 30.6]]);
    const rounded = roundDurations(shares);
    expect([...rounded.values()].reduce((sum, value) => sum + value, 0)).toBe(62);
    expect([...rounded.values()].every(Number.isInteger)).toBe(true);
    expect(shares.get("a")).toBe(10.6);
    expect(roundDurations(new Map())).toEqual(new Map());
});
