import { describe, expect, it } from "vitest";
import { coordinate, parseCoordinate, rowLabel, sampleSchema, validatePlacement, validateUniqueCode } from "./domain";
import { demoState } from "./demo-data";

describe("坐标转换", () => {
  it("支持常用和多字母行号", () => {
    expect(rowLabel(0)).toBe("A");
    expect(rowLabel(25)).toBe("Z");
    expect(rowLabel(26)).toBe("AA");
    expect(coordinate(8, 8)).toBe("I9");
    expect(parseCoordinate(" i9 ")).toEqual({ row: 8, column: 8 });
  });
  it("拒绝非法坐标", () => {
    expect(parseCoordinate("A0")).toBeNull();
    expect(parseCoordinate("1A")).toBeNull();
  });
});

describe("库存校验", () => {
  it("拒绝越界和重复占位", () => {
    const box = demoState.boxes[0];
    expect(validatePlacement(demoState, box, 9, 0)).toBe("孔位超出冻存盒范围");
    expect(validatePlacement(demoState, box, 5, 0)).toBe("该孔位已被占用");
    expect(validatePlacement(demoState, box, 0, 0)).toBeNull();
  });
  it("样本编号忽略大小写保持唯一", () => {
    expect(validateUniqueCode(demoState.samples, "shmcat-1")).toBe("样本编号已存在");
  });
  it("拒绝缺失字段与负数量", () => {
    const result = sampleSchema.safeParse({ code: "", name: "x", type: "冻存样品", source: "", collectedAt: "", frozenAt: "", dishSize: "", quantity: -1, unit: "管", project: "", notes: "" });
    expect(result.success).toBe(false);
  });
  it("接受包含三个登记参数的完整内部记录", () => {
    const result = sampleSchema.safeParse({ code: "INTERNAL", name: "PM原代", type: "冻存样品", source: "", collectedAt: "", frozenAt: "2026-06-30", dishSize: "10 cm 皿", quantity: 1, unit: "管", project: "", notes: "" });
    expect(result.success).toBe(true);
  });
});
