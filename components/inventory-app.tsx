"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Papa from "papaparse";
import {
  ArchiveRestore, ArrowDown, ArrowUp, ArrowUpDown, Box as BoxIcon, ChevronDown, CircleHelp, Cloud, Database,
  Download, FileClock, FlaskConical, GripVertical, Menu, Plus, Search, Settings,
  Snowflake, Trash2, Upload, X,
} from "lucide-react";
import { demoState } from "@/lib/demo-data";
import { coordinate, parseCoordinate, rowLabel, sampleSchema, uid, validatePlacement, validateUniqueCode } from "@/lib/domain";
import { loadCloudState, saveCloudState } from "@/lib/cloud";
import type { AuditEvent, Box, InventoryState, Sample, SampleTypeDefinition } from "@/lib/types";

type View = "box" | "search" | "history" | "settings";
type SampleDraft = Omit<Sample, "id" | "createdAt" | "updatedAt" | "status"> & { id?: string; boxId: string; position: string };
const SAMPLE_COLORS = [
  { value: "#2563eb", label: "蓝色" },
  { value: "#059669", label: "绿色" },
  { value: "#0891b2", label: "青色" },
  { value: "#7c3aed", label: "紫色" },
  { value: "#ea580c", label: "橙色" },
  { value: "#e11d48", label: "红色" },
] as const;
const DEFAULT_SAMPLE_COLOR = SAMPLE_COLORS[0].value;
const emptyDraft = (boxId: string, position = "A1", type = "细胞"): SampleDraft => ({
  code: "INTERNAL", name: "", type, source: "", collectedAt: "", frozenAt: new Date().toISOString().slice(0, 10), dishSize: "",
  quantity: 1, unit: "管", project: "", notes: "", customValues: {}, boxId, position,
});

function normalizeState(input: InventoryState): InventoryState {
  const next = structuredClone(input);
  const existingTypes = Array.isArray(next.sampleTypes) ? next.sampleTypes : [];
  if (!existingTypes.length) {
    const names = [...new Set(next.samples.map((sample) => sample.type || "其他"))];
    next.sampleTypes = names.length
      ? names.map((name, index) => { const legacyColor = next.samples.find((sample) => sample.type === name)?.customValues?.cellColor; return { id: uid("type"), name, color: SAMPLE_COLORS.some((color) => color.value === legacyColor) ? legacyColor! : SAMPLE_COLORS[index % SAMPLE_COLORS.length].value }; })
      : structuredClone(demoState.sampleTypes);
  }
  next.samples = next.samples.map((sample) => ({
    ...sample,
    type: sample.type || next.sampleTypes[0]?.name || "其他",
    dishSize: !sample.dishSize || sample.dishSize === "未记录" ? "" : sample.dishSize,
    customValues: sample.customValues ?? {},
  }));
  next.auditEvents = Array.isArray(next.auditEvents) ? next.auditEvents : [];
  return next;
}

function typeColor(state: InventoryState, typeName: string) {
  return state.sampleTypes.find((type) => type.name === typeName)?.color ?? DEFAULT_SAMPLE_COLOR;
}

function toggleSetItem(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function InventoryApp({ mode, userEmail, onSignOut, onChangePassword }: { mode: "demo" | "cloud"; userEmail?: string; onSignOut?: () => void | Promise<void>; onChangePassword?: (password: string) => Promise<string | null> }) {
  const [state, setState] = useState<InventoryState | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState("");
  const [view, setView] = useState<View>("box");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<SampleDraft | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [storageManagerOpen, setStorageManagerOpen] = useState(false);
  const [collapsedFreezers, setCollapsedFreezers] = useState<Set<string>>(() => new Set());
  const [collapsedRacks, setCollapsedRacks] = useState<Set<string>>(() => new Set());
  const [draggedStorage, setDraggedStorage] = useState<{ kind: "freezer" | "rack" | "box"; id: string } | null>(null);
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    async function initialize() {
      try {
        const stored = mode === "demo" ? localStorage.getItem("cryobox-demo-v1") : null;
        const next = mode === "cloud" ? await loadCloudState() : stored ? JSON.parse(stored) : structuredClone(demoState);
        const resolved = normalizeState(next && Array.isArray(next.boxes) ? next : structuredClone(demoState));
        setState(resolved);
        setSelectedBoxId(resolved.boxes.find((box: Box) => !box.deletedAt)?.id ?? "");
      } catch (cause) {
        setError(`数据载入失败：${cause instanceof Error ? cause.message : "未知错误"}`);
        setState(normalizeState(structuredClone(demoState)));
        setSelectedBoxId("box_1");
      } finally { loaded.current = true; }
    }
    initialize();
  }, [mode]);

  useEffect(() => {
    if (!state || !loaded.current) return;
    const timer = window.setTimeout(async () => {
      try {
        setSyncing(true);
        if (mode === "demo") localStorage.setItem("cryobox-demo-v1", JSON.stringify(state));
        else await saveCloudState(state);
      } catch (cause) {
        setError(`保存失败，请勿继续录入：${cause instanceof Error ? cause.message : "未知错误"}`);
      } finally { setSyncing(false); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state, mode]);

  const selectedBox = state?.boxes.find((box) => box.id === selectedBoxId && !box.deletedAt);
  const activeSamples = state?.samples.filter((sample) => !sample.deletedAt && sample.status !== "deleted") ?? [];
  const searchResults = useMemo(() => {
    if (!state) return [];
    const needle = query.trim().toLowerCase();
    return activeSamples.filter((sample) => {
      const location = state.locations.find((item) => item.sampleId === sample.id && item.active);
      const box = state.boxes.find((item) => item.id === location?.boxId);
      const rack = state.racks.find((item) => item.id === box?.rackId);
      const freezer = state.freezers.find((item) => item.id === rack?.freezerId);
      return !needle || [sample.name, sample.type, sample.dishSize, sample.frozenAt, box?.name, freezer?.name]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [state, activeSamples, query]);

  if (!state) return <main className="center-screen"><Snowflake className="spin" /> 正在载入库存…</main>;

  function addAudit(next: InventoryState, event: Omit<AuditEvent, "id" | "createdAt">) {
    next.auditEvents.unshift({ ...event, id: uid("audit"), createdAt: new Date().toISOString() });
  }

  function importLegacyBrowserData() {
    const stored = localStorage.getItem("cryobox-demo-v1");
    if (!stored) return setError("当前浏览器没有可导入的旧本地数据");
    try {
      const parsed = JSON.parse(stored) as InventoryState;
      if (!Array.isArray(parsed.boxes) || !Array.isArray(parsed.samples)) throw new Error("数据格式不完整");
      const localState = normalizeState(parsed);
      const summary = `${localState.freezers.length} 个冰箱、${localState.boxes.length} 个冻存盒、${localState.samples.length} 个样品`;
      if (!confirm(`将用旧本地数据（${summary}）替换当前账号的云端库存。\n\n本地原数据不会被删除。是否继续？`)) return;
      setState(localState);
      setSelectedBoxId(localState.boxes.find((box) => !box.deletedAt)?.id ?? "");
      setSelectedPositions([]);
      setNotice(`已导入${summary}，正在保存到云端`);
    } catch (cause) {
      setError(`旧数据导入失败：${cause instanceof Error ? cause.message : "无法解析"}`);
    }
  }

  async function changeLoginPassword() {
    if (!onChangePassword) return;
    const password = prompt("请输入新密码（至少 8 位）：");
    if (!password) return;
    if (password.length < 8) return setError("新密码至少需要 8 位");
    const repeated = prompt("请再次输入新密码：");
    if (password !== repeated) return setError("两次输入的密码不一致");
    const result = await onChangePassword(password);
    if (result) setError(`密码修改失败：${result}`);
    else setNotice("登录密码已修改");
  }

  function openSlot(row: number, column: number) {
    if (!selectedBox) return;
    const location = state!.locations.find((item) => item.boxId === selectedBox.id && item.row === row && item.column === column && item.active);
    const sample = state!.samples.find((item) => item.id === location?.sampleId);
    setError("");
    const position = coordinate(row, column);
    if (sample) {
      setSelectedPositions([]);
      setDraft({ ...sample, dishSize: sample.dishSize || "未记录", boxId: selectedBox.id, position });
    } else {
      setSelectedPositions((current) => current.includes(position) ? current.filter((item) => item !== position) : [...current, position]);
    }
  }

  function setEmptySlotSelected(row: number, column: number, selected: boolean) {
    if (!selectedBox) return;
    const occupied = state!.locations.some((item) => item.boxId === selectedBox.id && item.row === row && item.column === column && item.active);
    if (occupied) return;
    const position = coordinate(row, column);
    setSelectedPositions((current) => selected
      ? current.includes(position) ? current : [...current, position]
      : current.filter((item) => item !== position));
  }

  function dropStorage(targetKind: "freezer" | "rack" | "box", targetId: string) {
    if (!draggedStorage || draggedStorage.id === targetId) return setDraggedStorage(null);
    const next = structuredClone(state!);
    if (draggedStorage.kind === "freezer" && targetKind === "freezer") next.freezers = moveBefore(next.freezers, draggedStorage.id, targetId);
    if (draggedStorage.kind === "rack") {
      const rack = next.racks.find((item) => item.id === draggedStorage.id);
      if (rack && targetKind === "freezer") rack.freezerId = targetId;
      if (rack && targetKind === "rack") { const target = next.racks.find((item) => item.id === targetId); if (target) { rack.freezerId = target.freezerId; next.racks = moveBefore(next.racks, rack.id, target.id); } }
    }
    if (draggedStorage.kind === "box") {
      const box = next.boxes.find((item) => item.id === draggedStorage.id);
      if (box && targetKind === "rack") box.rackId = targetId;
      if (box && targetKind === "box") { const target = next.boxes.find((item) => item.id === targetId); if (target) { box.rackId = target.rackId; next.boxes = moveBefore(next.boxes, box.id, target.id); } }
    }
    setState(next);
    setDraggedStorage(null);
  }

  function openBatchRegistration() {
    if (!selectedBox || selectedPositions.length === 0) return setNotice("请先点击选择一个或多个空孔位");
    setDraft(emptyDraft(selectedBox.id, selectedPositions[0], state!.sampleTypes[0]?.name ?? "细胞"));
    setError("");
  }

  function saveSample(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const parsed = sampleSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    const box = state!.boxes.find((item) => item.id === draft.boxId && !item.deletedAt);
    const pos = parseCoordinate(draft.position);
    if (!box || !pos) return setError("请选择有效冻存盒并填写 A1 格式孔位");
    const batchPositions = draft.id ? [draft.position] : selectedPositions.length ? selectedPositions : [draft.position];
    const parsedPositions = batchPositions.map(parseCoordinate);
    if (parsedPositions.some((item) => !item)) return setError("所选孔位中存在无效坐标");
    const placementError = parsedPositions.map((item) => validatePlacement(state!, box, item!.row, item!.column, draft.id)).find(Boolean);
    const codeError = draft.id ? validateUniqueCode(state!.samples, draft.code, draft.id) : null;
    if (placementError || codeError) return setError(placementError || codeError || "校验失败");
    const next = structuredClone(state!);
    const now = new Date().toISOString();
    if (draft.id) {
      const sampleIndex = next.samples.findIndex((sample) => sample.id === draft.id);
      const previous = next.samples[sampleIndex];
      const oldLocation = next.locations.find((item) => item.sampleId === draft.id && item.active);
      const moved = !oldLocation || oldLocation.boxId !== box.id || oldLocation.row !== pos.row || oldLocation.column !== pos.column;
      next.samples[sampleIndex] = { ...previous, ...parsed.data, customValues: draft.customValues, status: "stored", deletedAt: undefined, updatedAt: now };
      if (moved) {
        if (oldLocation) { oldLocation.active = false; oldLocation.removedAt = now; oldLocation.removalReason = "移动"; }
        next.locations.push({ id: uid("loc"), sampleId: draft.id, boxId: box.id, row: pos.row, column: pos.column, active: true, storedAt: now });
        const restoring = previous.status !== "stored" || Boolean(previous.deletedAt);
        addAudit(next, { action: restoring ? "restore" : "move", entityType: "sample", entityId: draft.id, summary: restoring ? `${draft.code} 已恢复至 ${box.name} ${draft.position}` : `${draft.code} 移动至 ${box.name} ${draft.position}`, metadata: oldLocation ? { boxId: oldLocation.boxId, row: oldLocation.row, column: oldLocation.column } : {} });
      } else {
        addAudit(next, { action: "update", entityType: "sample", entityId: draft.id, summary: `更新样本 ${draft.code}`, metadata: { previous } });
      }
    } else {
      parsedPositions.forEach((item) => {
        const sampleId = uid("sample");
        const code = `CRYO-${crypto.randomUUID()}`;
        next.samples.push({ id: sampleId, ...parsed.data, code, customValues: { ...draft.customValues }, status: "stored", createdAt: now, updatedAt: now });
        next.locations.push({ id: uid("loc"), sampleId, boxId: box.id, row: item!.row, column: item!.column, active: true, storedAt: now });
        addAudit(next, { action: "create", entityType: "sample", entityId: sampleId, summary: `${draft.name} 入库`, metadata: { sampleName: draft.name, sampleType: draft.type, boxId: box.id, row: item!.row, column: item!.column } });
      });
    }
    setState(next); setDraft(null); setSelectedPositions([]); setError(""); setNotice(draft.id ? "样品已保存" : `已同时登记 ${batchPositions.length} 个孔位`);
  }

  function checkoutSample() {
    if (!draft?.id) return;
    const reason = window.prompt("请输入出库原因（必填）：")?.trim();
    if (!reason) return;
    const next = structuredClone(state!);
    const sample = next.samples.find((item) => item.id === draft.id)!;
    const location = next.locations.find((item) => item.sampleId === draft.id && item.active);
    if (!location) return setError("未找到活动孔位，无法出库");
    location.active = false; location.removedAt = new Date().toISOString(); location.removalReason = reason;
    sample.status = "checked_out"; sample.updatedAt = new Date().toISOString();
    addAudit(next, { action: "checkout", entityType: "sample", entityId: sample.id, summary: `${sample.name} 出库`, metadata: { sampleName: sample.name, sampleType: sample.type, reason, boxId: location.boxId, row: location.row, column: location.column } });
    setState(next); setDraft(null); setNotice("出库完成，历史位置已保留");
  }

  function undoLast() {
    const undoneEventIds = new Set(state!.auditEvents.filter((item) => item.action === "restore").map((item) => item.metadata?.undoneEventId).filter(Boolean));
    const event = state!.auditEvents.find((item) => ["move", "checkout"].includes(item.action) && !undoneEventIds.has(item.id));
    if (!event?.metadata) return setNotice("没有可撤销的移动或出库操作");
    const { boxId, row, column } = event.metadata as { boxId?: string; row?: number; column?: number };
    const box = state!.boxes.find((item) => item.id === boxId);
    if (!box || row == null || column == null) return setError("历史位置不完整，不能自动撤销");
    const conflict = validatePlacement(state!, box, row, column, event.entityId);
    if (conflict) return setError(`无法撤销：原孔位 ${coordinate(row, column)} 已被占用`);
    const next = structuredClone(state!);
    next.locations.filter((item) => item.sampleId === event.entityId && item.active).forEach((item) => { item.active = false; item.removedAt = new Date().toISOString(); item.removalReason = "撤销操作"; });
    next.locations.push({ id: uid("loc"), sampleId: event.entityId, boxId: box.id, row, column, active: true, storedAt: new Date().toISOString() });
    const sample = next.samples.find((item) => item.id === event.entityId);
    if (sample) { sample.status = "stored"; sample.updatedAt = new Date().toISOString(); }
    addAudit(next, { action: "restore", entityType: "sample", entityId: event.entityId, summary: `${sample?.name ?? "样品"} 重新入库`, metadata: { undoneEventId: event.id, sampleName: sample?.name, sampleType: sample?.type, boxId: box.id, row, column } });
    setState(next); setNotice("已撤销最近一次可逆操作");
  }

  function exportJson() {
    download(`冻存库存_${dateStamp()}.json`, JSON.stringify(state, null, 2), "application/json");
  }
  function exportCsv() {
    const rows = state!.samples.map((sample) => {
      const location = state!.locations.find((item) => item.sampleId === sample.id && item.active);
      const box = state!.boxes.find((item) => item.id === location?.boxId);
      return { 样品名称: sample.name, 样品类型: sample.type, 时间: sample.frozenAt, 复苏皿规格: sample.dishSize, 状态: sample.status, 冻存盒: box?.name ?? "", 孔位: location ? coordinate(location.row, location.column) : "" };
    });
    download(`冻存样本_${dateStamp()}.csv`, `\uFEFF${Papa.unparse(rows)}`, "text/csv;charset=utf-8");
  }

  function handleImport(file: File) {
    Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: true, complete: (result) => setImportRows(result.data) });
  }

  function confirmImport() {
    if (!selectedBox || !importRows) return;
    const next = structuredClone(state!);
    const errors: string[] = [];
    const now = new Date().toISOString();
    importRows.forEach((row, index) => {
      const pos = parseCoordinate(row["孔位"] ?? "");
      const name = (row["样品名称"] ?? "").trim();
      const type = (row["样品类型"] ?? "").trim();
      const frozenAt = (row["时间"] ?? "").trim();
      const dishSize = (row["复苏皿规格"] ?? "").trim();
      const code = `CRYO-${crypto.randomUUID()}`;
      if (!pos || !name || !type || !frozenAt || Number.isNaN(Date.parse(frozenAt))) { errors.push(`第 ${index + 2} 行：名称、类型、时间或孔位无效`); return; }
      if (!next.sampleTypes.some((item) => item.name === type)) { errors.push(`第 ${index + 2} 行：样品类型“${type}”尚未在系统设置中创建`); return; }
      const placementError = validatePlacement(next, selectedBox, pos.row, pos.column);
      if (placementError) { errors.push(`第 ${index + 2} 行：${placementError}`); return; }
      const sampleId = uid("sample");
      next.samples.push({ id: sampleId, code, name, type, source: "", collectedAt: "", frozenAt, dishSize, quantity: 1, unit: "管", project: "", notes: "", status: "stored", customValues: {}, createdAt: now, updatedAt: now });
      next.locations.push({ id: uid("loc"), sampleId, boxId: selectedBox.id, row: pos.row, column: pos.column, active: true, storedAt: now });
      addAudit(next, { action: "create", entityType: "sample", entityId: sampleId, summary: `${name} 入库`, metadata: { sampleName: name, sampleType: type, boxId: selectedBox.id, row: pos.row, column: pos.column } });
    });
    if (errors.length) return setError(`导入未执行，共 ${errors.length} 个错误：${errors.slice(0, 3).join("；")}`);
    setState(next); setImportRows(null); setNotice(`成功导入 ${importRows.length} 个样本`);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><FlaskConical /></span><div><strong>冻存管理</strong><small>CRYOBOX</small></div><button className="icon-button mobile-only" onClick={() => setSidebar(false)} aria-label="关闭菜单"><X /></button></div>
        <nav className="primary-nav">
          <NavButton active={view === "box"} icon={<BoxIcon />} label="冻存盒" onClick={() => setView("box")} />
          <NavButton active={view === "search"} icon={<Search />} label="样本检索" onClick={() => setView("search")} />
          <NavButton active={view === "history"} icon={<FileClock />} label="样品更新记录" onClick={() => setView("history")} />
          <NavButton active={view === "settings"} icon={<Settings />} label="系统设置" onClick={() => setView("settings")} />
        </nav>
        <div className="storage-tree">
          <div className="storage-heading"><p className="section-label">存储位置</p><button className="storage-settings-button" onClick={() => setStorageManagerOpen(true)} aria-label="管理存储位置" title="管理存储位置"><Settings /></button></div>
          {state.freezers.filter((f) => !f.deletedAt).map((freezer) => {
            const freezerCollapsed = collapsedFreezers.has(freezer.id);
            return <div key={freezer.id} className={`tree-group ${draggedStorage?.id === freezer.id ? "dragging" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={() => dropStorage("freezer", freezer.id)}>
              <button
                className="tree-toggle freezer-toggle"
                type="button"
                draggable
                onDragStart={() => setDraggedStorage({ kind: "freezer", id: freezer.id })}
                onDragEnd={() => setDraggedStorage(null)}
                aria-expanded={!freezerCollapsed}
                aria-label={`${freezerCollapsed ? "展开" : "折叠"}冰箱 ${freezer.name}`}
                onClick={() => setCollapsedFreezers((current) => toggleSetItem(current, freezer.id))}
              >
                <GripVertical className="drag-handle" />
                <ChevronDown className={freezerCollapsed ? "collapsed" : ""} />
                <Snowflake />
                <span>{freezer.name}</span>
              </button>
              {!freezerCollapsed && state.racks.filter((rack) => rack.freezerId === freezer.id && !rack.deletedAt).map((rack) => {
                const rackCollapsed = collapsedRacks.has(rack.id);
                return <div key={rack.id} className={`tree-rack ${draggedStorage?.id === rack.id ? "dragging" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropStorage("rack", rack.id); }}>
                  <button
                    className="tree-toggle rack-toggle"
                    type="button"
                    draggable
                    onDragStart={(event) => { event.stopPropagation(); setDraggedStorage({ kind: "rack", id: rack.id }); }}
                    onDragEnd={() => setDraggedStorage(null)}
                    aria-expanded={!rackCollapsed}
                    aria-label={`${rackCollapsed ? "展开" : "折叠"}层架 ${rack.name}`}
                    onClick={() => setCollapsedRacks((current) => toggleSetItem(current, rack.id))}
                  >
                    <GripVertical className="drag-handle" />
                    <ChevronDown className={rackCollapsed ? "collapsed" : ""} />
                    <span>{rack.name}</span>
                  </button>
                  {!rackCollapsed && state.boxes.filter((box) => box.rackId === rack.id && !box.deletedAt).map((box) =>
                    <button key={box.id} type="button" draggable className={`tree-box-button ${box.id === selectedBoxId ? "selected" : ""} ${draggedStorage?.id === box.id ? "dragging" : ""}`} onDragStart={(event) => { event.stopPropagation(); setDraggedStorage({ kind: "box", id: box.id }); }} onDragEnd={() => setDraggedStorage(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropStorage("box", box.id); }} onClick={() => { setSelectedBoxId(box.id); setSelectedPositions([]); setView("box"); setSidebar(false); }}>
                      <GripVertical className="drag-handle" />
                      <BoxIcon />
                      <span>{box.name}</span>
                    </button>
                  )}
                </div>;
              })}
            </div>;
          })}
        </div>
        <div className="account-note">{mode === "cloud" ? <><strong>{userEmail}</strong><span>云端数据已按账号隔离</span><button type="button" onClick={onSignOut}>退出登录</button></> : "数据仅保留在本浏览器"}</div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setSidebar(true)} aria-label="打开菜单"><Menu /></button>
          <div><h1>{viewTitle(view)}</h1><p>{view === "box" && selectedBox ? `${selectedBox.rows} × ${selectedBox.columns} · ${selectedBox.temperature ?? "温度未设置"}` : "样本库存与位置管理"}</p></div>
          <div className="top-selection-slot">{selectedPositions.length > 0 && <div className="top-selection-bar"><div><strong>已选择 {selectedPositions.length} 个孔位</strong><span>{selectedPositions.join("、")}</span></div><div><button className="button secondary" onClick={() => setSelectedPositions([])}>取消</button><button className="button primary" onClick={openBatchRegistration}>批量登记</button></div></div>}</div>
          <div className="top-actions"><span className="sync-status">{syncing ? "正在保存…" : mode === "cloud" ? <><Cloud size={14} /> 已同步</> : <><Database size={14} /> 本地保存</>}</span><button className="button secondary" onClick={undoLast}><ArchiveRestore size={16} /> 撤销</button>{selectedBox && <button className="button primary" onClick={selectedPositions.length ? openBatchRegistration : () => setNotice("请点击空孔位进行选择，可同时选择多个")}><Plus size={17} /> {selectedPositions.length ? `登记所选（${selectedPositions.length}）` : "选择孔位登记"}</button>}</div>
        </header>
        {(error || notice) && <div className={`banner ${error ? "error" : "success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X /></button></div>}
        <main className="content">
          {view === "box" && <BoxView state={state} box={selectedBox} openSlot={openSlot} setEmptySlotSelected={setEmptySlotSelected} query={query} setQuery={setQuery} onImport={handleImport} exportCsv={exportCsv} selectedPositions={selectedPositions} />}
          {view === "search" && <SearchView state={state} query={query} setQuery={setQuery} results={searchResults} onOpen={(sample) => setDraft(toDraft(state, sample))} />}
          {view === "history" && <SampleHistoryView state={state} />}
          {view === "settings" && <SettingsView state={state} setState={setState} selectedBoxId={selectedBoxId} setSelectedBoxId={setSelectedBoxId} exportJson={exportJson} exportCsv={exportCsv} importLegacyBrowserData={mode === "cloud" ? importLegacyBrowserData : undefined} changeLoginPassword={onChangePassword ? changeLoginPassword : undefined} />}
        </main>
      </div>
      {draft && <SampleModal draft={draft} setDraft={setDraft} state={state} selectedCount={draft.id ? 1 : Math.max(selectedPositions.length, 1)} onSubmit={saveSample} onClose={() => { setDraft(null); setError(""); }} onCheckout={checkoutSample} />}
      {importRows && <ImportModal rows={importRows} box={selectedBox} onCancel={() => setImportRows(null)} onConfirm={confirmImport} />}
      {storageManagerOpen && <StorageManager state={state} setState={setState} selectedBoxId={selectedBoxId} setSelectedBoxId={(id) => { setSelectedBoxId(id); setSelectedPositions([]); }} onClose={() => setStorageManagerOpen(false)} />}
    </div>
  );
}

function BoxView({ state, box, openSlot, setEmptySlotSelected, query, setQuery, onImport, exportCsv, selectedPositions }: { state: InventoryState; box?: Box; openSlot: (r: number, c: number) => void; setEmptySlotSelected: (r: number, c: number, selected: boolean) => void; query: string; setQuery: (v: string) => void; onImport: (file: File) => void; exportCsv: () => void; selectedPositions: string[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const gridScrollerRef = useRef<HTMLDivElement>(null);
  const dragSelection = useRef<{ active: boolean; selecting: boolean; visited: Set<string> }>({ active: false, selecting: true, visited: new Set() });
  const touchSelection = useRef<{ row: number; column: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const [slotSize, setSlotSize] = useState(44);

  useEffect(() => {
    const stopDragging = () => { dragSelection.current.active = false; };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  function beginDragSelection(row: number, column: number, selected: boolean) {
    const position = coordinate(row, column);
    dragSelection.current = { active: true, selecting: !selected, visited: new Set([position]) };
    setEmptySlotSelected(row, column, !selected);
  }

  function extendDragSelection(row: number, column: number) {
    const drag = dragSelection.current;
    const position = coordinate(row, column);
    if (!drag.active || drag.visited.has(position)) return;
    drag.visited.add(position);
    setEmptySlotSelected(row, column, drag.selecting);
  }

  function startTouchSelection(event: React.TouchEvent, row: number, column: number) {
    const touch = event.touches[0];
    if (!touch) return;
    touchSelection.current = { row, column, x: touch.clientX, y: touch.clientY, moved: false };
  }

  function moveTouchSelection(event: React.TouchEvent) {
    const gesture = touchSelection.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    if (Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 10) gesture.moved = true;
  }

  function endTouchSelection(event: React.TouchEvent, row: number, column: number) {
    const gesture = touchSelection.current;
    touchSelection.current = null;
    if (!gesture || gesture.moved || gesture.row !== row || gesture.column !== column) return;
    event.preventDefault();
    suppressClickUntil.current = Date.now() + 600;
    openSlot(row, column);
  }

  useEffect(() => {
    const scroller = gridScrollerRef.current;
    if (!scroller || !box) return;
    const updateSlotSize = () => {
      if (window.matchMedia("(max-width: 760px)").matches) {
        setSlotSize(56);
        return;
      }
      const styles = window.getComputedStyle(scroller);
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const gap = 4;
      const headerWidth = 34;
      const headerHeight = 24;
      const availableWidth = scroller.clientWidth - horizontalPadding - headerWidth - box.columns * gap;
      const availableHeight = window.innerHeight - scroller.getBoundingClientRect().top - 18 - verticalPadding - headerHeight - box.rows * gap;
      const fittedSize = Math.floor(Math.min(availableWidth / box.columns, availableHeight / box.rows));
      setSlotSize(Math.max(44, Math.min(78, fittedSize)));
    };
    updateSlotSize();
    const observer = new ResizeObserver(updateSlotSize);
    observer.observe(scroller);
    window.addEventListener("resize", updateSlotSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSlotSize);
    };
  }, [box, selectedPositions.length]);

  if (!box) return <EmptyState title="尚未创建冻存盒" text="请在系统设置中依次创建冰箱、层架和冻存盒。" />;
  const occupied = state.locations.filter((item) => item.boxId === box.id && item.active).length;
  return <div className="box-workspace">
    <section className="panel box-panel">
      <div className="legend"><span><i className="empty" />空孔</span><span><i className="selected" />已选择</span><span><i className="stored" />已存样品</span><span className="hint"><CircleHelp size={14} /> 点击或拖动空孔可连续多选</span></div>
      <div ref={gridScrollerRef} className="grid-scroller" style={{ "--slot-size": `${slotSize}px` } as CSSProperties}><div className="box-grid" style={{ gridTemplateColumns: `34px repeat(${box.columns}, var(--slot-size))`, width: "max-content" }}><div className="corner" />{Array.from({ length: box.columns }, (_, c) => <div className="column-label" key={`head-${c}`}>{c + 1}</div>)}{Array.from({ length: box.rows }, (_, row) => <RowSlots key={row} row={row} box={box} state={state} query={query} openSlot={openSlot} selectedPositions={selectedPositions} beginDragSelection={beginDragSelection} extendDragSelection={extendDragSelection} startTouchSelection={startTouchSelection} moveTouchSelection={moveTouchSelection} endTouchSelection={endTouchSelection} suppressClickUntil={suppressClickUntil} />)}</div></div>
    </section>
    <aside className="panel box-info-rail">
      <div className="metric-stack"><div className="metric"><span>已占用</span><strong>{occupied}</strong><small>个孔位</small></div><div className="metric"><span>空余</span><strong>{box.rows * box.columns - occupied}</strong><small>个孔位</small></div><div className="metric"><span>使用率</span><strong>{Math.round((occupied / (box.rows * box.columns)) * 100)}%</strong><small>{box.rows * box.columns} 个总孔位</small></div></div>
      <div className="rail-tools"><div className="search-control"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="查找样品名称" /></div><input ref={fileRef} hidden type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} /><button className="button secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> 导入</button><button className="button secondary" onClick={exportCsv}><Download size={16} /> 导出</button></div>
    </aside>
  </div>;
}

function RowSlots({ row, box, state, query, openSlot, selectedPositions, beginDragSelection, extendDragSelection, startTouchSelection, moveTouchSelection, endTouchSelection, suppressClickUntil }: { row: number; box: Box; state: InventoryState; query: string; openSlot: (r: number, c: number) => void; selectedPositions: string[]; beginDragSelection: (r: number, c: number, selected: boolean) => void; extendDragSelection: (r: number, c: number) => void; startTouchSelection: (event: React.TouchEvent, row: number, column: number) => void; moveTouchSelection: (event: React.TouchEvent) => void; endTouchSelection: (event: React.TouchEvent, row: number, column: number) => void; suppressClickUntil: React.MutableRefObject<number> }) {
  return <><div className="row-label">{rowLabel(row)}</div>{Array.from({ length: box.columns }, (_, column) => {
    const location = state.locations.find((item) => item.boxId === box.id && item.row === row && item.column === column && item.active);
    const sample = state.samples.find((item) => item.id === location?.sampleId);
    const dimmed = Boolean(query && sample && !`${sample.code} ${sample.name}`.toLowerCase().includes(query.toLowerCase()));
    const position = coordinate(row, column);
    const selected = selectedPositions.includes(position);
    return <button key={`${row}-${column}`} className={`slot ${sample ? "occupied" : ""} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`} style={sample ? { "--sample-color": typeColor(state, sample.type) } as CSSProperties : undefined} onPointerDown={(event) => { if (event.pointerType === "mouse" && event.button === 0 && !sample) { event.preventDefault(); beginDragSelection(row, column, selected); } }} onPointerEnter={() => { if (!sample) extendDragSelection(row, column); }} onTouchStart={(event) => startTouchSelection(event, row, column)} onTouchMove={moveTouchSelection} onTouchEnd={(event) => endTouchSelection(event, row, column)} onTouchCancel={() => { suppressClickUntil.current = Date.now() + 300; }} onClick={(event) => { if (Date.now() < suppressClickUntil.current) return; if (!sample && (event.nativeEvent as PointerEvent).pointerType === "mouse") return; openSlot(row, column); }} aria-pressed={selected} aria-label={`${position} ${sample ? `${sample.name}，${sample.type}` : selected ? "已选择" : "空孔"}`}>{sample && <><strong>{sample.name}</strong><small>{formatSlotDate(sample.frozenAt)}</small></>}</button>;
  })}</>;
}

function SearchView({ state, query, setQuery, results, onOpen }: { state: InventoryState; query: string; setQuery: (v: string) => void; results: Sample[]; onOpen: (s: Sample) => void }) {
  type SortKey = "name" | "type" | "date" | "dish" | "location" | "status";
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const rows = results.map((sample, index) => ({ sample, index, location: sampleLocationText(state, sample) }));
  rows.sort((a, b) => {
    const values = {
      name: [a.sample.name, b.sample.name], type: [a.sample.type, b.sample.type], date: [a.sample.frozenAt, b.sample.frozenAt],
      dish: [a.sample.dishSize, b.sample.dishSize], location: [a.location, b.location], status: [a.sample.status, b.sample.status],
    }[sort.key];
    const compared = values[0].localeCompare(values[1], "zh-CN", { numeric: true, sensitivity: "base" });
    return compared ? (sort.direction === "asc" ? compared : -compared) : a.index - b.index;
  });
  const toggleSort = (key: SortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  const Head = ({ label, column }: { label: string; column: SortKey }) => <th><button className="sort-button" onClick={() => toggleSort(column)}>{label}{sort.key === column ? sort.direction === "asc" ? <ArrowUp /> : <ArrowDown /> : <ArrowUpDown />}</button></th>;
  return <section className="panel"><div className="panel-toolbar"><div className="search-control wide"><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索样品名称、类型、复苏皿规格、冰箱或冻存盒" /></div><span className="result-count">{results.length} 条结果</span></div><div className="table-scroll"><table><thead><tr><Head label="样品名称" column="name" /><Head label="样品类型" column="type" /><Head label="时间" column="date" /><Head label="复苏皿规格" column="dish" /><Head label="存储位置" column="location" /><Head label="状态" column="status" /></tr></thead><tbody>{rows.map(({ sample, location }) => <tr key={sample.id} onClick={() => onOpen(sample)}><td><strong>{sample.name}</strong></td><td>{sample.type}</td><td>{sample.frozenAt || "—"}</td><td>{sample.dishSize || "—"}</td><td>{location}</td><td><Status status={sample.status} /></td></tr>)}</tbody></table></div></section>;
}

function SampleHistoryView({ state }: { state: InventoryState }) {
  const events = state.auditEvents.filter((event) => event.entityType === "sample" && ["create", "checkout", "restore"].includes(event.action));
  return <section className="panel"><div className="panel-heading"><div><h2>样品更新记录</h2><p>仅记录样品入库和出库。</p></div></div>{events.length ? <div className="timeline">{events.map((event) => { const sample = state.samples.find((item) => item.id === event.entityId); const metadata = event.metadata ?? {}; const path = historyLocationText(state, metadata); const outbound = event.action === "checkout"; return <div className="timeline-item" key={event.id}><span className={`timeline-icon ${event.action}`}><FileClock /></span><div><strong>{metadata.sampleName as string || sample?.name || event.summary}</strong><p>{outbound ? "出库" : "入库"} · {metadata.sampleType as string || sample?.type || "类型未记录"} · {path}</p><p>{new Date(event.createdAt).toLocaleString("zh-CN")}{outbound && metadata.reason ? ` · 原因：${metadata.reason}` : ""}</p></div></div>; })}</div> : <EmptyState title="暂无样品更新记录" text="登记入库或办理出库后会显示在这里。" />}</section>;
}

function SettingsView({ state, setState, selectedBoxId, setSelectedBoxId, exportJson, exportCsv, importLegacyBrowserData, changeLoginPassword }: { state: InventoryState; setState: (s: InventoryState) => void; selectedBoxId: string; setSelectedBoxId: (id: string) => void; exportJson: () => void; exportCsv: () => void; importLegacyBrowserData?: () => void; changeLoginPassword?: () => void }) {
  function addFreezer() { const name = prompt("冰箱名称：", nextNumberedName(state.freezers, "-80°C冰箱 "))?.trim(); if (!name) return; const next = structuredClone(state); next.freezers.push({ id: uid("freezer"), name, location: "" }); setState(next); }
  function addRack() { if (!state.freezers.length) return alert("请先创建冰箱"); const siblings = state.racks.filter((item) => item.freezerId === state.freezers[0].id); const name = prompt("层架名称：", nextNumberedName(siblings, "层架"))?.trim(); if (!name) return; const next = structuredClone(state); next.racks.push({ id: uid("rack"), freezerId: state.freezers[0].id, name }); setState(next); }
  function addBox() { if (!state.racks.length) return alert("请先创建层架"); const siblings = state.boxes.filter((item) => item.rackId === state.racks[0].id); const name = prompt("冻存盒名称：", nextNumberedName(siblings, "冻存盒"))?.trim(); if (!name) return; const spec = prompt("规格：输入 9x9、10x10 或自定义行x列", "9x9")?.toLowerCase().match(/^(\d{1,2})\s*x\s*(\d{1,2})$/); if (!spec) return alert("规格格式无效"); const rows = Number(spec[1]), columns = Number(spec[2]); if (rows < 1 || columns < 1 || rows > 26 || columns > 30) return alert("当前支持 1–26 行、1–30 列"); const next = structuredClone(state); const id = uid("box"); next.boxes.push({ id, rackId: state.racks[0].id, name, rows, columns, temperature: "-80°C" }); setState(next); setSelectedBoxId(id); }
  function addField() { const name = prompt("自定义字段名称：")?.trim(); if (!name) return; const next = structuredClone(state); next.customFields.push({ id: uid("field"), name, required: confirm("是否设为必填字段？") }); setState(next); }
  function addType() { const name = prompt("新样品类型名称：")?.trim(); if (!name) return; if (state.sampleTypes.some((item) => item.name.toLowerCase() === name.toLowerCase())) return alert("样品类型已存在"); const next = structuredClone(state); next.sampleTypes.push({ id: uid("type"), name, color: SAMPLE_COLORS[next.sampleTypes.length % SAMPLE_COLORS.length].value }); setState(next); }
  function renameType(type: SampleTypeDefinition) { const name = prompt("修改样品类型名称：", type.name)?.trim(); if (!name || name === type.name) return; if (state.sampleTypes.some((item) => item.id !== type.id && item.name.toLowerCase() === name.toLowerCase())) return alert("样品类型已存在"); const next = structuredClone(state); next.sampleTypes.find((item) => item.id === type.id)!.name = name; next.samples.filter((sample) => sample.type === type.name).forEach((sample) => { sample.type = name; }); setState(next); }
  function recolorType(type: SampleTypeDefinition, color: string) { const next = structuredClone(state); next.sampleTypes.find((item) => item.id === type.id)!.color = color; setState(next); }
  function removeType(type: SampleTypeDefinition) { if (state.samples.some((sample) => sample.type === type.name)) return alert("该类型正在被样品使用，不能删除"); if (state.sampleTypes.length === 1) return alert("至少保留一个样品类型"); if (!confirm(`确认删除样品类型“${type.name}”？`)) return; const next = structuredClone(state); next.sampleTypes = next.sampleTypes.filter((item) => item.id !== type.id); setState(next); }
  return <div className="settings-grid"><section className="panel"><div className="panel-heading"><div><h2>存储结构</h2><p>新增结构会自动生成可编辑编号名称。</p></div></div><div className="settings-actions"><button className="button secondary" onClick={addFreezer}><Plus /> 新建冰箱</button><button className="button secondary" onClick={addRack}><Plus /> 新建层架</button><button className="button primary" onClick={addBox}><Plus /> 新建冻存盒</button></div><ul className="simple-list"><li>冰箱 <strong>{state.freezers.length}</strong></li><li>层架 <strong>{state.racks.length}</strong></li><li>冻存盒 <strong>{state.boxes.filter((b) => !b.deletedAt).length}</strong></li></ul></section><section className="panel"><div className="panel-heading"><div><h2>样品类型</h2><p>类型颜色会统一应用到对应单元格。</p></div><button className="button secondary" onClick={addType}><Plus /> 添加</button></div><div className="sample-type-list">{state.sampleTypes.map((type) => <div key={type.id}><input type="color" value={type.color} onChange={(event) => recolorType(type, event.target.value)} aria-label={`修改${type.name}颜色`} /><strong>{type.name}</strong><button className="button secondary" onClick={() => renameType(type)}>修改名称</button><button className="button danger-ghost" onClick={() => removeType(type)}>删除</button></div>)}</div></section><section className="panel"><div className="panel-heading"><div><h2>自定义字段</h2><p>字段会出现在所有样本录入表单中。</p></div><button className="button secondary" onClick={addField}><Plus /> 添加</button></div>{state.customFields.length ? <ul className="simple-list">{state.customFields.map((f) => <li key={f.id}>{f.name}<span>{f.required ? "必填" : "选填"}</span></li>)}</ul> : <EmptyState title="暂无自定义字段" text="标准字段已可直接使用。" />}</section><section className="panel"><div className="panel-heading"><div><h2>备份、迁移与账号</h2><p>JSON 包含全部库存、位置和样品更新记录。</p></div></div><div className="settings-actions"><button className="button secondary" onClick={exportJson}><Download /> 完整 JSON</button><button className="button secondary" onClick={exportCsv}><Download /> 样本 CSV</button>{importLegacyBrowserData && <button className="button secondary" onClick={importLegacyBrowserData}><Upload /> 导入旧本地数据</button>}{changeLoginPassword && <button className="button secondary" onClick={changeLoginPassword}>修改登录密码</button>}</div><div className="warning-note">{importLegacyBrowserData ? "旧数据导入会替换当前账号的云端库存，但不会删除浏览器中的原本地数据。" : "请定期导出完整 JSON 备份。"}</div></section></div>;
}

function StorageManager({ state, setState, selectedBoxId, setSelectedBoxId, onClose }: { state: InventoryState; setState: (state: InventoryState) => void; selectedBoxId: string; setSelectedBoxId: (id: string) => void; onClose: () => void }) {
  const initialBox = state.boxes.find((box) => box.id === selectedBoxId && !box.deletedAt) ?? state.boxes.find((box) => !box.deletedAt);
  const initialRack = state.racks.find((rack) => rack.id === initialBox?.rackId && !rack.deletedAt) ?? state.racks.find((rack) => !rack.deletedAt);
  const initialFreezer = state.freezers.find((freezer) => freezer.id === initialRack?.freezerId && !freezer.deletedAt) ?? state.freezers.find((freezer) => !freezer.deletedAt);
  const [freezerId, setFreezerId] = useState(initialFreezer?.id ?? "");
  const [rackId, setRackId] = useState(initialRack?.id ?? "");
  const [boxId, setBoxId] = useState(initialBox?.id ?? "");

  const freezers = state.freezers.filter((item) => !item.deletedAt);
  const racks = state.racks.filter((item) => !item.deletedAt && item.freezerId === freezerId);
  const boxes = state.boxes.filter((item) => !item.deletedAt && item.rackId === rackId);

  function record(next: InventoryState, action: "create" | "update", entityId: string, summary: string) {
    next.auditEvents.unshift({ id: uid("audit"), action, entityType: "system", entityId, summary, createdAt: new Date().toISOString() });
    setState(next);
  }

  function selectFreezer(id: string) {
    setFreezerId(id);
    const nextRack = state.racks.find((rack) => rack.freezerId === id && !rack.deletedAt);
    setRackId(nextRack?.id ?? "");
    const nextBox = state.boxes.find((box) => box.rackId === nextRack?.id && !box.deletedAt);
    setBoxId(nextBox?.id ?? "");
    if (nextBox) setSelectedBoxId(nextBox.id);
  }

  function selectRack(id: string) {
    setRackId(id);
    const nextBox = state.boxes.find((box) => box.rackId === id && !box.deletedAt);
    setBoxId(nextBox?.id ?? "");
    if (nextBox) setSelectedBoxId(nextBox.id);
  }

  function selectBox(id: string) {
    setBoxId(id);
    if (id) setSelectedBoxId(id);
  }

  function createFreezer() {
    const name = prompt("新冰箱名称：", nextNumberedName(freezers, "-80°C冰箱 "))?.trim();
    if (!name) return;
    if (freezers.some((item) => item.name.toLowerCase() === name.toLowerCase())) return alert("冰箱名称已存在");
    const id = uid("freezer");
    const next = structuredClone(state);
    next.freezers.push({ id, name, location: "" });
    record(next, "create", id, `新建冰箱：${name}`);
    setFreezerId(id); setRackId(""); setBoxId("");
  }

  function createRack() {
    if (!freezerId) return alert("请先选择或新建冰箱");
    const name = prompt("新层架名称：", nextNumberedName(racks, "层架"))?.trim();
    if (!name) return;
    if (racks.some((item) => item.name.toLowerCase() === name.toLowerCase())) return alert("该冰箱内已有同名层架");
    const id = uid("rack");
    const next = structuredClone(state);
    next.racks.push({ id, freezerId, name });
    record(next, "create", id, `在 ${freezers.find((item) => item.id === freezerId)?.name} 中新建层架：${name}`);
    setRackId(id); setBoxId("");
  }

  function createBox() {
    if (!rackId) return alert("请先选择或新建层架");
    const name = prompt("新冻存盒名称：", nextNumberedName(boxes, "冻存盒"))?.trim();
    if (!name) return;
    if (boxes.some((item) => item.name.toLowerCase() === name.toLowerCase())) return alert("该层架内已有同名冻存盒");
    const spec = prompt("冻存盒规格：输入 9x9、10x10 或自定义行x列", "9x9")?.trim().toLowerCase().match(/^(\d{1,2})\s*x\s*(\d{1,2})$/);
    if (!spec) return alert("规格格式无效，例如：9x9");
    const rows = Number(spec[1]); const columns = Number(spec[2]);
    if (rows < 1 || rows > 26 || columns < 1 || columns > 30) return alert("当前支持 1–26 行、1–30 列");
    const id = uid("box");
    const next = structuredClone(state);
    next.boxes.push({ id, rackId, name, rows, columns, temperature: "-80°C" });
    record(next, "create", id, `在 ${racks.find((item) => item.id === rackId)?.name} 中新建冻存盒：${name}（${rows}×${columns}）`);
    setBoxId(id); setSelectedBoxId(id);
  }

  function rename(kind: "freezer" | "rack" | "box") {
    const target = kind === "freezer" ? state.freezers.find((item) => item.id === freezerId) : kind === "rack" ? state.racks.find((item) => item.id === rackId) : state.boxes.find((item) => item.id === boxId);
    if (!target) return alert("请先选择需要重命名的项目");
    const name = prompt(`将“${target.name}”重命名为：`, target.name)?.trim();
    if (!name || name === target.name) return;
    const siblings = kind === "freezer" ? freezers : kind === "rack" ? racks : boxes;
    if (siblings.some((item) => item.id !== target.id && item.name.toLowerCase() === name.toLowerCase())) return alert("同级位置中已存在该名称");
    const next = structuredClone(state);
    const collection = kind === "freezer" ? next.freezers : kind === "rack" ? next.racks : next.boxes;
    const item = collection.find((entry) => entry.id === target.id);
    if (item) item.name = name;
    record(next, "update", target.id, `将${kind === "freezer" ? "冰箱" : kind === "rack" ? "层架" : "冻存盒"}“${target.name}”重命名为“${name}”`);
  }

  function remove(kind: "freezer" | "rack" | "box") {
    const target = kind === "freezer" ? state.freezers.find((item) => item.id === freezerId) : kind === "rack" ? state.racks.find((item) => item.id === rackId) : state.boxes.find((item) => item.id === boxId);
    if (!target) return alert("请先选择需要删除的项目");
    if (kind === "freezer" && state.racks.some((item) => item.freezerId === target.id && !item.deletedAt)) return alert("该冰箱中仍有层架，请先删除层架");
    if (kind === "rack" && state.boxes.some((item) => item.rackId === target.id && !item.deletedAt)) return alert("该层架中仍有冻存盒，请先删除冻存盒");
    if (kind === "box" && state.locations.some((item) => item.boxId === target.id && item.active)) return alert("该冻存盒中仍有在库样品，不能删除");
    const label = kind === "freezer" ? "冰箱" : kind === "rack" ? "层架" : "冻存盒";
    if (!confirm(`确认删除${label}“${target.name}”？\n该操作会保留历史记录，但不会在存储位置中继续显示。`)) return;
    const next = structuredClone(state);
    const now = new Date().toISOString();
    if (kind === "freezer") next.freezers.find((item) => item.id === target.id)!.deletedAt = now;
    if (kind === "rack") next.racks.find((item) => item.id === target.id)!.deletedAt = now;
    if (kind === "box") next.boxes.find((item) => item.id === target.id)!.deletedAt = now;
    record(next, "update", target.id, `删除${label}：${target.name}`);

    if (kind === "box") {
      const replacement = next.boxes.find((item) => item.rackId === rackId && !item.deletedAt) ?? next.boxes.find((item) => !item.deletedAt);
      setBoxId(replacement?.id ?? "");
      setSelectedBoxId(replacement?.id ?? "");
    } else if (kind === "rack") {
      const replacementRack = next.racks.find((item) => item.freezerId === freezerId && !item.deletedAt);
      const replacementBox = next.boxes.find((item) => item.rackId === replacementRack?.id && !item.deletedAt);
      setRackId(replacementRack?.id ?? ""); setBoxId(replacementBox?.id ?? ""); setSelectedBoxId(replacementBox?.id ?? "");
    } else {
      const replacementFreezer = next.freezers.find((item) => !item.deletedAt);
      const replacementRack = next.racks.find((item) => item.freezerId === replacementFreezer?.id && !item.deletedAt);
      const replacementBox = next.boxes.find((item) => item.rackId === replacementRack?.id && !item.deletedAt);
      setFreezerId(replacementFreezer?.id ?? ""); setRackId(replacementRack?.id ?? ""); setBoxId(replacementBox?.id ?? ""); setSelectedBoxId(replacementBox?.id ?? "");
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal storage-manager-modal" role="dialog" aria-modal="true"><header><div><p className="eyebrow">存储位置设置</p><h2>管理冰箱、层架和冻存盒</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header><div className="storage-manager-body"><StorageManagerRow label="冰箱" value={freezerId} options={freezers} onChange={selectFreezer} onRename={() => rename("freezer")} onCreate={createFreezer} onDelete={() => remove("freezer")} /><StorageManagerRow label="层架" value={rackId} options={racks} onChange={selectRack} onRename={() => rename("rack")} onCreate={createRack} onDelete={() => remove("rack")} disabled={!freezerId} /><StorageManagerRow label="冻存盒" value={boxId} options={boxes} onChange={selectBox} onRename={() => rename("box")} onCreate={createBox} onDelete={() => remove("box")} disabled={!rackId} /></div><footer><span>删除采用软删除；必须先清空下级结构或在库样品。</span><div><button className="button primary" onClick={onClose}>完成</button></div></footer></section></div>;
}

function StorageManagerRow({ label, value, options, onChange, onRename, onCreate, onDelete, disabled = false }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (id: string) => void; onRename: () => void; onCreate: () => void; onDelete: () => void; disabled?: boolean }) {
  return <div className="storage-manager-row"><div><strong>{label}</strong><small>{disabled ? `请先选择上级位置` : options.length ? `共 ${options.length} 项` : "暂未创建"}</small></div><select value={value} disabled={disabled || !options.length} onChange={(event) => onChange(event.target.value)} aria-label={`选择${label}`}><option value="">请选择</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button secondary" disabled={disabled || !value} onClick={onRename}>重命名</button><button className="button secondary" disabled={disabled} onClick={onCreate}><Plus /> 新建</button><button className="button danger-ghost" disabled={disabled || !value} onClick={onDelete}><Trash2 /> 删除</button></div>;
}

function SampleModal({ draft, setDraft, state, selectedCount, onSubmit, onClose, onCheckout }: { draft: SampleDraft; setDraft: (d: SampleDraft) => void; state: InventoryState; selectedCount: number; onSubmit: (e: React.FormEvent) => void; onClose: () => void; onCheckout: () => void }) {
  const field = (key: keyof SampleDraft, value: unknown) => setDraft({ ...draft, [key]: value });
  const boxName = state.boxes.find((box) => box.id === draft.boxId)?.name ?? "冻存盒";
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal sample-modal compact-modal" role="dialog" aria-modal="true"><header><div><p className="eyebrow">{draft.id ? "样品详情" : "批量登记"}</p><h2>{draft.id ? `${draft.name} · ${draft.position}` : `${boxName} · 已选 ${selectedCount} 个孔位`}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header><form onSubmit={onSubmit}><div className="form-grid simple-form"><label className="full">样品名称 *<input autoFocus required value={draft.name} onChange={(e) => field("name", e.target.value)} placeholder="例如：ShMCAT、PM原代" /></label><label>样品类型 *<select required value={draft.type} onChange={(e) => field("type", e.target.value)}>{state.sampleTypes.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}</select></label><div className="type-color-preview"><span style={{ background: typeColor(state, draft.type) }} />颜色由样品类型统一设置</div><label>时间 *<input type="date" required value={draft.frozenAt} onChange={(e) => field("frozenAt", e.target.value)} /></label><label>复苏到多大的皿（仅细胞填写）<input value={draft.dishSize} onChange={(e) => field("dishSize", e.target.value)} placeholder="例如：6 cm 皿、10 cm 皿" list="dish-size-options" /><datalist id="dish-size-options"><option value="3.5 cm 皿" /><option value="6 cm 皿" /><option value="10 cm 皿" /><option value="15 cm 皿" /></datalist></label></div>{!draft.id && <div className="batch-note">将为所选 {selectedCount} 个孔位分别建立相同的样品记录。</div>}<footer><div>{draft.id && <button type="button" className="button secondary" onClick={onCheckout}>办理出库</button>}</div><div><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary">{draft.id ? "保存修改" : `登记 ${selectedCount} 个孔位`}</button></div></footer></form></section></div>;
}

function ImportModal({ rows, box, onCancel, onConfirm }: { rows: Record<string, string>[]; box?: Box; onCancel: () => void; onConfirm: () => void }) { return <div className="modal-backdrop"><section className="modal"><header><div><p className="eyebrow">批量导入预览</p><h2>{rows.length} 条记录 → {box?.name}</h2></div><button className="icon-button" onClick={onCancel}><X /></button></header><div className="import-help">必需列：样品名称、样品类型、时间、孔位。复苏皿规格可选；确认前不会写入任何数据。</div><div className="table-scroll"><table><thead><tr><th>行</th><th>样品名称</th><th>样品类型</th><th>时间</th><th>复苏皿规格</th><th>孔位</th></tr></thead><tbody>{rows.slice(0, 20).map((row, index) => <tr key={index}><td>{index + 2}</td><td>{row["样品名称"]}</td><td>{row["样品类型"]}</td><td>{row["时间"]}</td><td>{row["复苏皿规格"] || "—"}</td><td>{row["孔位"]}</td></tr>)}</tbody></table></div><footer><span>{rows.length > 20 ? `仅预览前 20 条，共 ${rows.length} 条` : `共 ${rows.length} 条`}</span><div><button className="button secondary" onClick={onCancel}>取消</button><button className="button primary" onClick={onConfirm}>校验并导入</button></div></footer></section></div>; }

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>; }
function Status({ status }: { status: Sample["status"] }) { return <span className={`status ${status}`}>{status === "stored" ? "在库" : status === "checked_out" ? "已出库" : "已删除"}</span>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><BoxIcon /><strong>{title}</strong><p>{text}</p></div>; }
function viewTitle(view: View) { return ({ box: "冻存盒", search: "样本检索", history: "样品更新记录", settings: "系统设置" })[view]; }
function locationPath(state: InventoryState, boxId: string, row: number, column: number) { const box = state.boxes.find((item) => item.id === boxId); const rack = state.racks.find((item) => item.id === box?.rackId); const freezer = state.freezers.find((item) => item.id === rack?.freezerId); return box && rack && freezer ? `${freezer.name}-${rack.name}-${box.name}-${coordinate(row, column)}` : "位置记录不完整"; }
function sampleLocationText(state: InventoryState, sample: Sample) { const active = state.locations.find((item) => item.sampleId === sample.id && item.active); if (active) return locationPath(state, active.boxId, active.row, active.column); const latest = state.locations.filter((item) => item.sampleId === sample.id).sort((a, b) => (b.removedAt || b.storedAt).localeCompare(a.removedAt || a.storedAt))[0]; return latest ? `已出库（原位置：${locationPath(state, latest.boxId, latest.row, latest.column)}）` : "已出库（原位置未知）"; }
function historyLocationText(state: InventoryState, metadata: Record<string, unknown>) { const { boxId, row, column } = metadata as { boxId?: string; row?: number; column?: number }; return boxId && row != null && column != null ? locationPath(state, boxId, row, column) : "位置记录不完整"; }
function moveBefore<T extends { id: string }>(items: T[], movingId: string, targetId: string) { const moving = items.find((item) => item.id === movingId); if (!moving) return items; const rest = items.filter((item) => item.id !== movingId); const targetIndex = rest.findIndex((item) => item.id === targetId); if (targetIndex < 0) return [...rest, moving]; rest.splice(targetIndex, 0, moving); return rest; }
function nextNumberedName(items: Array<{ name: string; deletedAt?: string }>, prefix: string) { let number = 1; const names = new Set(items.filter((item) => !item.deletedAt).map((item) => item.name)); while (names.has(`${prefix}${number}`)) number += 1; return `${prefix}${number}`; }
function firstAvailable(state: InventoryState, box: Box) { for (let row = 0; row < box.rows; row++) for (let column = 0; column < box.columns; column++) if (!state.locations.some((l) => l.active && l.boxId === box.id && l.row === row && l.column === column)) return coordinate(row, column); return null; }
function toDraft(state: InventoryState, sample: Sample): SampleDraft { const location = state.locations.find((l) => l.sampleId === sample.id && l.active); const box = state.boxes.find((b) => b.id === location?.boxId) ?? state.boxes.find((b) => !b.deletedAt); return { ...sample, boxId: box?.id ?? "", position: location ? coordinate(location.row, location.column) : box ? firstAvailable(state, box) ?? "A1" : "A1" }; }
function dateStamp() { return new Date().toISOString().slice(0, 10); }
function formatSlotDate(value: string) {
  const match = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(value);
  return match ? `${match[1].slice(-2)}-${Number(match[2])}` : value;
}
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
