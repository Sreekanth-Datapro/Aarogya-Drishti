import { classifyPatches, resolvePatches } from "./applyPatches";

describe("applyPatches", () => {
  test("applies patches to empty fields", () => {
    const { applicable, conflicts } = classifyPatches(
      { full_name: "", sex: "" },
      [{ field: "full_name", value: "Rama" }, { field: "sex", value: "FEMALE" }],
    );
    expect(conflicts).toHaveLength(0);
    expect(applicable.map((item) => item.field)).toEqual(["full_name", "sex"]);
  });

  test("does not silently overwrite different existing values", () => {
    const { applicable, conflicts } = classifyPatches(
      { full_name: "Existing", sex: "" },
      [{ field: "full_name", value: "Voice Name" }, { field: "sex", value: "MALE" }],
    );
    expect(applicable).toEqual([{ field: "sex", value: "MALE" }]);
    expect(conflicts).toEqual([
      expect.objectContaining({ field: "full_name", value: "Voice Name", currentValue: "Existing" }),
    ]);
  });

  test("resolve keeps existing unless user chooses voice", () => {
    const conflicts = [{ field: "full_name", value: "Voice Name", currentValue: "Existing" }];
    const kept = resolvePatches({ applicable: [], conflicts, choices: { full_name: "keep" } });
    expect(kept.updates).toEqual({});
    const replaced = resolvePatches({ applicable: [], conflicts, choices: { full_name: "voice" } });
    expect(replaced.updates).toEqual({ full_name: "Voice Name" });
    expect(replaced.filledFields).toEqual(["full_name"]);
  });
});
