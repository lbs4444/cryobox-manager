import { z } from "zod";
import type { InventoryState } from "@/lib/types";

const stateSchema = z.object({
  freezers: z.array(z.record(z.string(), z.unknown())),
  racks: z.array(z.record(z.string(), z.unknown())),
  boxes: z.array(z.record(z.string(), z.unknown())),
  samples: z.array(z.record(z.string(), z.unknown())),
  locations: z.array(z.record(z.string(), z.unknown())),
  customFields: z.array(z.record(z.string(), z.unknown())),
  sampleTypes: z.array(z.record(z.string(), z.unknown())),
  auditEvents: z.array(z.record(z.string(), z.unknown())),
}).superRefine((state, context) => {
  if (JSON.stringify(state).length > 8_000_000) context.addIssue({ code: "custom", message: "库存数据过大" });
});

export function parseInventoryState(value: unknown) {
  return stateSchema.parse(value) as unknown as InventoryState;
}
