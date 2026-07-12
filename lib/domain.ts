import { z } from "zod";
import type { Box, InventoryState, Sample } from "./types";

export const sampleSchema = z.object({
  code: z.string().trim().min(1, "样本编号不能为空"),
  name: z.string().trim().min(1, "样本名称不能为空"),
  type: z.string().trim().min(1, "样本类型不能为空"),
  source: z.string().trim().default(""),
  collectedAt: z.string().refine((v) => !v || !Number.isNaN(Date.parse(v)), "采集日期无效"),
  frozenAt: z.string().min(1, "时间不能为空").refine((v) => !Number.isNaN(Date.parse(v)), "时间无效"),
  dishSize: z.string().trim().default(""),
  quantity: z.coerce.number().nonnegative("数量不能小于 0"),
  unit: z.string().trim().min(1, "单位不能为空"),
  project: z.string().trim().default(""),
  notes: z.string().default(""),
});

export function rowLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

export function coordinate(row: number, column: number): string {
  return `${rowLabel(row)}${column + 1}`;
}

export function parseCoordinate(value: string): { row: number; column: number } | null {
  const match = value.trim().toUpperCase().match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) return null;
  let row = 0;
  for (const char of match[1]) row = row * 26 + char.charCodeAt(0) - 64;
  return { row: row - 1, column: Number(match[2]) - 1 };
}

export function validatePlacement(state: InventoryState, box: Box, row: number, column: number, ignoreSampleId?: string) {
  if (row < 0 || column < 0 || row >= box.rows || column >= box.columns) return "孔位超出冻存盒范围";
  const occupied = state.locations.some(
    (location) =>
      location.active &&
      location.boxId === box.id &&
      location.row === row &&
      location.column === column &&
      location.sampleId !== ignoreSampleId,
  );
  return occupied ? "该孔位已被占用" : null;
}

export function validateUniqueCode(samples: Sample[], code: string, ignoreId?: string) {
  return samples.some((sample) => sample.code.toLowerCase() === code.trim().toLowerCase() && sample.id !== ignoreId && !sample.deletedAt)
    ? "样本编号已存在"
    : null;
}

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

export function randomUuid(cryptoApi: CryptoLike | undefined = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uid(prefix: string) {
  return `${prefix}_${randomUuid()}`;
}
