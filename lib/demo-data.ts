import type { InventoryState } from "./types";

const now = new Date().toISOString();

export const demoState: InventoryState = {
  freezers: [{ id: "freezer_1", name: "-80°C 冰箱 1", location: "实验室 A 区" }],
  racks: [{ id: "rack_1", freezerId: "freezer_1", name: "层架 1" }],
  boxes: [{ id: "box_1", rackId: "rack_1", name: "神经肿瘤样本盒", rows: 9, columns: 9, temperature: "-80°C" }],
  samples: [
    { id: "sample_1", code: "ShMCAT-1", name: "ShMCAT-1", type: "冻存样品", source: "", collectedAt: "", frozenAt: "2026-06-02", dishSize: "10 cm 皿", quantity: 1, unit: "管", project: "", notes: "", status: "stored", customValues: {}, createdAt: now, updatedAt: now },
    { id: "sample_2", code: "ShMCAT-2", name: "ShMCAT-2", type: "冻存样品", source: "", collectedAt: "", frozenAt: "2026-06-02", dishSize: "10 cm 皿", quantity: 1, unit: "管", project: "", notes: "", status: "stored", customValues: {}, createdAt: now, updatedAt: now },
    { id: "sample_3", code: "PM原代", name: "PM原代", type: "冻存样品", source: "", collectedAt: "", frozenAt: "2026-06-08", dishSize: "6 cm 皿", quantity: 1, unit: "管", project: "", notes: "", status: "stored", customValues: {}, createdAt: now, updatedAt: now },
    { id: "sample_4", code: "P5原代", name: "P5原代", type: "冻存样品", source: "", collectedAt: "", frozenAt: "2026-06-10", dishSize: "6 cm 皿", quantity: 1, unit: "管", project: "", notes: "", status: "stored", customValues: {}, createdAt: now, updatedAt: now },
  ],
  locations: [
    { id: "loc_1", sampleId: "sample_1", boxId: "box_1", row: 5, column: 0, active: true, storedAt: now },
    { id: "loc_2", sampleId: "sample_2", boxId: "box_1", row: 5, column: 1, active: true, storedAt: now },
    { id: "loc_3", sampleId: "sample_3", boxId: "box_1", row: 8, column: 0, active: true, storedAt: now },
    { id: "loc_4", sampleId: "sample_4", boxId: "box_1", row: 8, column: 1, active: true, storedAt: now },
  ],
  customFields: [],
  auditEvents: [{ id: "audit_1", action: "import", entityType: "system", entityId: "demo", summary: "已载入演示数据", createdAt: now }],
};
