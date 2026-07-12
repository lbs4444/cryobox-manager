import { describe, expect, it } from "vitest";
import { coordinate, parseCoordinate, randomUuid, rowLabel, sampleSchema, uid, validatePlacement, validateUniqueCode } from "./domain";
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
  it("全新浏览器使用空白默认结构", () => {
    expect(demoState.freezers[0].name).toBe("-80°C冰箱 1");
    expect(demoState.racks[0].name).toBe("层架1");
    expect(demoState.boxes[0].name).toBe("冻存盒1");
    expect(demoState.samples).toHaveLength(0);
    expect(demoState.locations).toHaveLength(0);
    expect(demoState.sampleTypes.map((item) => item.name)).toEqual(["细胞", "其他"]);
  });
  it("拒绝越界和重复占位", () => {
    const box = demoState.boxes[0];
    const occupiedState = structuredClone(demoState);
    occupiedState.locations.push({ id: "loc_test", sampleId: "sample_test", boxId: box.id, row: 5, column: 0, active: true, storedAt: new Date().toISOString() });
    expect(validatePlacement(demoState, box, 9, 0)).toBe("孔位超出冻存盒范围");
    expect(validatePlacement(occupiedState, box, 5, 0)).toBe("该孔位已被占用");
    expect(validatePlacement(demoState, box, 0, 0)).toBeNull();
  });
  it("样本编号忽略大小写保持唯一", () => {
    const samples = [{ id: "sample_test", code: "ShMCAT-1", name: "x", type: "细胞", source: "", collectedAt: "", frozenAt: "2026-07-02", dishSize: "", quantity: 1, unit: "管", project: "", notes: "", status: "stored" as const, customValues: {}, createdAt: "", updatedAt: "" }];
    expect(validateUniqueCode(samples, "shmcat-1")).toBe("样本编号已存在");
  });
  it("拒绝缺失字段与负数量", () => {
    const result = sampleSchema.safeParse({ code: "", name: "x", type: "冻存样品", source: "", collectedAt: "", frozenAt: "", dishSize: "", quantity: -1, unit: "管", project: "", notes: "" });
    expect(result.success).toBe(false);
  });
  it("接受包含三个登记参数的完整内部记录", () => {
    const result = sampleSchema.safeParse({ code: "INTERNAL", name: "PM原代", type: "冻存样品", source: "", collectedAt: "", frozenAt: "2026-06-30", dishSize: "10 cm 皿", quantity: 1, unit: "管", project: "", notes: "" });
    expect(result.success).toBe(true);
  });
  it("非细胞样品允许复苏皿留空", () => {
    const result = sampleSchema.safeParse({ code: "INTERNAL", name: "组织1", type: "其他", source: "", collectedAt: "", frozenAt: "2026-07-02", dishSize: "", quantity: 1, unit: "管", project: "", notes: "" });
    expect(result.success).toBe(true);
  });
});

describe("ID 生成", () => {
  it("在 HTTP 页面缺少 randomUUID 时使用 getRandomValues", () => {
    const fallbackCrypto = {
      getRandomValues<T extends ArrayBufferView | null>(array: T) {
        const bytes = array as Uint8Array;
        bytes.forEach((_, index) => { bytes[index] = index; });
        return array;
      },
    };

    expect(randomUuid(fallbackCrypto)).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("所有业务 ID 都通过兼容生成器创建", () => {
    expect(uid("sample")).toMatch(/^sample_[0-9a-f-]{36}$/);
  });
});
