import {describe, expect, it} from "vitest";
import {invoke} from "./core";

type Rule = {id: number; cat_id: number | null; manual_project_id: number | null; regex: string};
type Category = {id: number; name: string; color: string | null; parent_id: number | null};
type Block = {id: number; project_id: number | null};

const newCategory = (name: string, priority: number, parent_id: number | null = null, color: string | null = null) =>
    invoke<number>("insert_category", {newCategory: {name, priority, color, parent_id}});

async function addBlock(title: string, start: number) {
    const id = await invoke<number>("insert_manual_time_block", {newManualTimeBlock: {title, start_time: start, end_time: start + 60}});
    const blocks = await invoke<Block[]>("get_manual_time_blocks", {rangeStart: start, rangeEnd: start + 60});
    return blocks.find((block) => block.id === id)!;
}

describe("demo category rules", () => {
    it("keeps subcategory rules inside the parent's slot and reports the subcategory", async () => {
        const high = await newCategory("Rules high", 90_000);
        const parent = await newCategory("Rules parent", 80_000, null, "#123456");
        const sub = await newCategory("Rules sub", 999_999, parent);
        await invoke("insert_category_rule", {rule: {cat_id: parent, manual_project_id: null, regex: "rules-editor"}});
        await invoke("insert_category_rule", {rule: {cat_id: sub, manual_project_id: null, regex: "rules-editor main"}});
        await invoke("insert_category_rule", {rule: {cat_id: high, manual_project_id: null, regex: "rules-chat"}});

        const categories = await invoke<Category[]>("get_categories");
        expect(categories.find((category) => category.id === sub)).toMatchObject({parent_id: parent, color: "#123456"});
        await expect(invoke("get_matching_category_rule", {appName: "rules-editor main"})).resolves.toMatchObject({category_name: "Rules parent", subcategory: "Rules sub"});
        await expect(invoke("get_matching_category_rule", {appName: "rules-chat rules-editor main"})).resolves.toMatchObject({category_name: "Rules high", subcategory: null});

        await invoke("delete_category_by_id", {id: sub, cascade: false});
        const rules = await invoke<Rule[]>("get_category_rules");
        expect(rules.find((rule) => rule.regex === "rules-editor main")?.cat_id).toBe(parent);
    });

    it("rejects a subcategory of a subcategory", async () => {
        const parent = await newCategory("Nesting parent", 1);
        const sub = await newCategory("Nesting sub", 0, parent);
        await expect(newCategory("Nesting too deep", 0, sub)).rejects.toThrow("cannot have their own subcategories");
    });

    it("fills in Uncategorized manual entries but keeps explicit choices", async () => {
        const low = await invoke<number>("create_manual_project", {name: "Rules low"});
        const high = await invoke<number>("create_manual_project", {name: "Rules top"});
        await invoke("update_manual_project_priority", {id: high, priority: 10});
        await invoke("insert_category_rule", {rule: {cat_id: null, manual_project_id: low, regex: "(?i)^homework"}});
        await invoke("insert_category_rule", {rule: {cat_id: null, manual_project_id: high, regex: "homework essay"}});

        await expect(invoke("match_manual_rule", {title: "HOMEWORK notes"})).resolves.toBe(low);
        await expect(invoke("match_manual_rule", {title: "homework essay"})).resolves.toBe(high);
        await expect(invoke("match_manual_rule", {title: "nothing here"})).resolves.toBeNull();

        const start = 1_900_000_000;
        expect((await addBlock("homework essay", start)).project_id).toBe(high);
        const unmatched = await addBlock("later homework", start + 120);
        expect(unmatched.project_id).toBeNull();

        const moved = {...unmatched, title: "later homework", start_time: start + 120, end_time: start + 180, project_id: null};
        await invoke("update_manual_time_block", {manualTimeBlock: moved});
        await invoke("update_manual_time_block", {manualTimeBlock: {...moved, title: "homework later"}});
        const [edited] = await invoke<Block[]>("get_manual_time_blocks", {rangeStart: start + 120, rangeEnd: start + 180});
        expect(edited.project_id).toBe(low);
    });

    it("moves a rule between auto and manual, and applies rules to existing entries", async () => {
        const project = await invoke<number>("create_manual_project", {name: "Rules target"});
        const category = await newCategory("Rules move", 5);
        const start = 1_900_100_000;
        const block = await addBlock("gym session", start);
        expect(block.project_id).toBeNull();

        const id = await invoke<number>("insert_category_rule", {rule: {cat_id: category, manual_project_id: null, regex: "gym"}});
        await invoke("update_category_rule", {rule: {id, cat_id: null, manual_project_id: project, regex: "gym"}});
        const rule = (await invoke<Rule[]>("get_category_rules")).find((row) => row.id === id);
        expect(rule).toMatchObject({cat_id: null, manual_project_id: project});

        await expect(invoke("apply_manual_rules")).resolves.toBeGreaterThanOrEqual(1);
        const [applied] = await invoke<Block[]>("get_manual_time_blocks", {rangeStart: start, rangeEnd: start + 60});
        expect(applied.project_id).toBe(project);

        await invoke("delete_manual_project", {id: project});
        expect((await invoke<Rule[]>("get_category_rules")).some((row) => row.id === id)).toBe(false);
    });

    it("needs exactly one target and a valid pattern", async () => {
        await expect(invoke("insert_category_rule", {rule: {cat_id: null, manual_project_id: null, regex: "x"}})).rejects.toThrow("Choose one category");
        await expect(invoke("insert_category_rule", {rule: {cat_id: 1, manual_project_id: 1, regex: "x"}})).rejects.toThrow("Choose one category");
        await expect(invoke("insert_category_rule", {rule: {cat_id: 1, manual_project_id: null, regex: "("}})).rejects.toThrow("Invalid regex");
    });
});
