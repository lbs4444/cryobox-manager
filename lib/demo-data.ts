import type { InventoryState } from "./types";

export const demoState: InventoryState = {
  freezers: [{ id: "freezer_1", name: "-80°C冰箱 1", location: "" }],
  racks: [{ id: "rack_1", freezerId: "freezer_1", name: "层架1" }],
  boxes: [{ id: "box_1", rackId: "rack_1", name: "冻存盒1", rows: 9, columns: 9, temperature: "-80°C" }],
  samples: [],
  locations: [],
  customFields: [],
  sampleTypes: [
    { id: "type_cell", name: "细胞", color: "#2563eb" },
    { id: "type_other", name: "其他", color: "#7c6f9b" },
  ],
  auditEvents: [],
};
