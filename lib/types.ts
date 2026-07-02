export type SampleStatus = "stored" | "checked_out" | "deleted";

export interface Freezer {
  id: string;
  name: string;
  location: string;
  deletedAt?: string;
}

export interface Rack {
  id: string;
  freezerId: string;
  name: string;
  deletedAt?: string;
}

export interface Box {
  id: string;
  rackId: string;
  name: string;
  rows: number;
  columns: number;
  temperature?: string;
  deletedAt?: string;
}

export interface Sample {
  id: string;
  code: string;
  name: string;
  type: string;
  source: string;
  collectedAt: string;
  frozenAt: string;
  dishSize: string;
  quantity: number;
  unit: string;
  project: string;
  notes: string;
  status: SampleStatus;
  customValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SampleLocation {
  id: string;
  sampleId: string;
  boxId: string;
  row: number;
  column: number;
  active: boolean;
  storedAt: string;
  removedAt?: string;
  removalReason?: string;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  required: boolean;
}

export interface SampleTypeDefinition {
  id: string;
  name: string;
  color: string;
}

export type AuditAction =
  | "create"
  | "update"
  | "move"
  | "checkout"
  | "restore"
  | "delete"
  | "import";

export interface AuditEvent {
  id: string;
  action: AuditAction;
  entityType: "sample" | "box" | "system";
  entityId: string;
  summary: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface InventoryState {
  freezers: Freezer[];
  racks: Rack[];
  boxes: Box[];
  samples: Sample[];
  locations: SampleLocation[];
  customFields: CustomFieldDefinition[];
  sampleTypes: SampleTypeDefinition[];
  auditEvents: AuditEvent[];
}
