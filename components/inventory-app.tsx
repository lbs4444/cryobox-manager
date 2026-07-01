"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Papa from "papaparse";
import {
  ArchiveRestore, Box as BoxIcon, ChevronDown, CircleHelp, Cloud, Database,
  Download, FileClock, FlaskConical, LogOut, Menu, Plus, Search, Settings,
  LogIn, Snowflake, Trash2, Upload, X,
} from "lucide-react";
import { demoState } from "@/lib/demo-data";
import { coordinate, parseCoordinate, rowLabel, sampleSchema, uid, validatePlacement, validateUniqueCode } from "@/lib/domain";
import { loadCloudState, saveCloudState } from "@/lib/cloud";
import type { AuditEvent, Box, InventoryState, Sample } from "@/lib/types";

type View = "box" | "search" | "audit" | "trash" | "settings";
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
const validSampleColor = (value?: string) => SAMPLE_COLORS.some((color) => color.value === value) ? value! : DEFAULT_SAMPLE_COLOR;
const emptyDraft = (boxId: string, position = "A1"): SampleDraft => ({
  code: "INTERNAL", name: "", type: "冻存样品", source: "", collectedAt: "", frozenAt: new Date().toISOString().slice(0, 10), dishSize: "",
  quantity: 1, unit: "管", project: "", notes: "", customValues: { cellColor: DEFAULT_SAMPLE_COLOR }, boxId, position,
});

function toggleSetItem(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function InventoryApp({ mode, userEmail, onSignOut, onSignIn }: { mode: "demo" | "cloud"; userEmail?: string; onSignOut?: () => void; onSignIn?: () => void }) {
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
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    async function initialize() {
      try {
        const stored = mode === "demo" ? localStorage.getItem("cryobox-demo-v1") : null;
        const next = mode === "cloud" ? await loadCloudState() : stored ? JSON.parse(stored) : structuredClone(demoState);
        const resolved = next && Array.isArray(next.boxes) ? next : structuredClone(demoState);
        resolved.samples = resolved.samples.map((sample: Sample) => ({ ...sample, dishSize: sample.dishSize || "未记录", customValues: { ...sample.customValues, cellColor: validSampleColor(sample.customValues?.cellColor) } }));
        setState(resolved);
        setSelectedBoxId(resolved.boxes.find((box: Box) => !box.deletedAt)?.id ?? "");
      } catch (cause) {
        setError(`数据载入失败：${cause instanceof Error ? cause.message : "未知错误"}`);
        setState(structuredClone(demoState));
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
  const activeBoxes = state?.boxes.filter((box) => !box.deletedAt) ?? [];
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

  function openBatchRegistration() {
    if (!selectedBox || selectedPositions.length === 0) return setNotice("请先点击选择一个或多个空孔位");
    setDraft(emptyDraft(selectedBox.id, selectedPositions[0]));
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
      const createdIds: string[] = [];
      parsedPositions.forEach((item) => {
        const sampleId = uid("sample");
        const code = `CRYO-${crypto.randomUUID()}`;
        next.samples.push({ id: sampleId, ...parsed.data, code, customValues: { ...draft.customValues, cellColor: validSampleColor(draft.customValues.cellColor) }, status: "stored", createdAt: now, updatedAt: now });
        next.locations.push({ id: uid("loc"), sampleId, boxId: box.id, row: item!.row, column: item!.column, active: true, storedAt: now });
        createdIds.push(sampleId);
      });
      addAudit(next, { action: "create", entityType: "system", entityId: box.id, summary: `批量登记 ${createdIds.length} 管“${draft.name}”至 ${box.name}：${batchPositions.join("、")}`, metadata: { sampleIds: createdIds, positions: batchPositions } });
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
    addAudit(next, { action: "checkout", entityType: "sample", entityId: sample.id, summary: `${sample.code} 已出库：${reason}`, metadata: { boxId: location.boxId, row: location.row, column: location.column } });
    setState(next); setDraft(null); setNotice("出库完成，历史位置已保留");
  }

  function deleteSample() {
    if (!draft?.id || !window.confirm("确认将该样本移入回收站？记录不会被物理删除。")) return;
    const next = structuredClone(state!);
    const sample = next.samples.find((item) => item.id === draft.id)!;
    next.locations.filter((item) => item.sampleId === sample.id && item.active).forEach((item) => { item.active = false; item.removedAt = new Date().toISOString(); item.removalReason = "移入回收站"; });
    sample.status = "deleted"; sample.deletedAt = new Date().toISOString(); sample.updatedAt = sample.deletedAt;
    addAudit(next, { action: "delete", entityType: "sample", entityId: sample.id, summary: `${sample.code} 已移入回收站` });
    setState(next); setDraft(null); setNotice("样本已移入回收站");
  }

  function restoreSample(sample: Sample) {
    const firstBox = activeBoxes[0];
    if (!firstBox) return setError("请先创建冻存盒");
    setDraft({ ...sample, boxId: firstBox.id, position: firstAvailable(state!, firstBox) ?? "A1" });
    setView("box");
    setNotice("请选择一个空孔位后保存，恢复才会完成");
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
    addAudit(next, { action: "restore", entityType: "sample", entityId: event.entityId, summary: `已撤销操作，恢复至 ${box.name} ${coordinate(row, column)}`, metadata: { undoneEventId: event.id } });
    setState(next); setNotice("已撤销最近一次可逆操作");
  }

  function exportJson() {
    download(`冻存库存_${dateStamp()}.json`, JSON.stringify(state, null, 2), "application/json");
  }
  function exportCsv() {
    const rows = state!.samples.map((sample) => {
      const location = state!.locations.find((item) => item.sampleId === sample.id && item.active);
      const box = state!.boxes.find((item) => item.id === location?.boxId);
      return { 样品名称: sample.name, 样品类型: sample.type, 时间: sample.frozenAt, 复苏皿规格: sample.dishSize, 单元格颜色: validSampleColor(sample.customValues.cellColor), 状态: sample.status, 冻存盒: box?.name ?? "", 孔位: location ? coordinate(location.row, location.column) : "" };
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
      const type = (row["样品类型"] ?? "冻存样品").trim() || "冻存样品";
      const frozenAt = (row["时间"] ?? "").trim();
      const dishSize = (row["复苏皿规格"] ?? "").trim();
      const cellColor = validSampleColor((row["单元格颜色"] ?? "").trim());
      const code = `CRYO-${crypto.randomUUID()}`;
      if (!pos || !name || !dishSize || !frozenAt || Number.isNaN(Date.parse(frozenAt))) { errors.push(`第 ${index + 2} 行：名称、时间、复苏皿规格或孔位无效`); return; }
      const placementError = validatePlacement(next, selectedBox, pos.row, pos.column);
      if (placementError) { errors.push(`第 ${index + 2} 行：${placementError}`); return; }
      const sampleId = uid("sample");
      next.samples.push({ id: sampleId, code, name, type, source: "", collectedAt: "", frozenAt, dishSize, quantity: 1, unit: "管", project: "", notes: "", status: "stored", customValues: { cellColor }, createdAt: now, updatedAt: now });
      next.locations.push({ id: uid("loc"), sampleId, boxId: selectedBox.id, row: pos.row, column: pos.column, active: true, storedAt: now });
    });
    if (errors.length) return setError(`导入未执行，共 ${errors.length} 个错误：${errors.slice(0, 3).join("；")}`);
    addAudit(next, { action: "import", entityType: "system", entityId: selectedBox.id, summary: `批量导入 ${importRows.length} 个样本至 ${selectedBox.name}` });
    setState(next); setImportRows(null); setNotice(`成功导入 ${importRows.length} 个样本`);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><FlaskConical /></span><div><strong>冻存管理</strong><small>CRYOBOX</small></div><button className="icon-button mobile-only" onClick={() => setSidebar(false)} aria-label="关闭菜单"><X /></button></div>
        <nav className="primary-nav">
          <NavButton active={view === "box"} icon={<BoxIcon />} label="冻存盒" onClick={() => setView("box")} />
          <NavButton active={view === "search"} icon={<Search />} label="样本检索" onClick={() => setView("search")} />
          <NavButton active={view === "audit"} icon={<FileClock />} label="操作记录" onClick={() => setView("audit")} />
          <NavButton active={view === "trash"} icon={<Trash2 />} label="回收站" onClick={() => setView("trash")} />
          <NavButton active={view === "settings"} icon={<Settings />} label="系统设置" onClick={() => setView("settings")} />
          {mode === "demo" && onSignIn && <NavButton active={false} icon={<LogIn />} label="登录云端" onClick={onSignIn} />}
        </nav>
        <div className="storage-tree">
          <div className="storage-heading"><p className="section-label">存储位置</p><button className="storage-settings-button" onClick={() => setStorageManagerOpen(true)} aria-label="管理存储位置" title="管理存储位置"><Settings /></button></div>
          {state.freezers.filter((f) => !f.deletedAt).map((freezer) => {
            const freezerCollapsed = collapsedFreezers.has(freezer.id);
            return <div key={freezer.id} className="tree-group">
              <button
                className="tree-toggle freezer-toggle"
                type="button"
                aria-expanded={!freezerCollapsed}
                aria-label={`${freezerCollapsed ? "展开" : "折叠"}冰箱 ${freezer.name}`}
                onClick={() => setCollapsedFreezers((current) => toggleSetItem(current, freezer.id))}
              >
                <ChevronDown className={freezerCollapsed ? "collapsed" : ""} />
                <Snowflake />
                <span>{freezer.name}</span>
              </button>
              {!freezerCollapsed && state.racks.filter((rack) => rack.freezerId === freezer.id && !rack.deletedAt).map((rack) => {
                const rackCollapsed = collapsedRacks.has(rack.id);
                return <div key={rack.id} className="tree-rack">
                  <button
                    className="tree-toggle rack-toggle"
                    type="button"
                    aria-expanded={!rackCollapsed}
                    aria-label={`${rackCollapsed ? "展开" : "折叠"}层架 ${rack.name}`}
                    onClick={() => setCollapsedRacks((current) => toggleSetItem(current, rack.id))}
                  >
                    <ChevronDown className={rackCollapsed ? "collapsed" : ""} />
                    <span>{rack.name}</span>
                  </button>
                  {!rackCollapsed && state.boxes.filter((box) => box.rackId === rack.id && !box.deletedAt).map((box) =>
                    <button key={box.id} type="button" className={`tree-box-button ${box.id === selectedBoxId ? "selected" : ""}`} onClick={() => { setSelectedBoxId(box.id); setSelectedPositions([]); setView("box"); setSidebar(false); }}>
                      <BoxIcon />
                      <span>{box.name}</span>
                    </button>
                  )}
                </div>;
              })}
            </div>;
          })}
        </div>
        <div className="account"><span className={`status-dot ${mode}`} /><div><strong>{mode === "cloud" ? userEmail : "本地演示模式"}</strong><small>{mode === "cloud" ? "云端同步" : "数据仅保存在本浏览器"}</small></div>{onSignOut && <button className="icon-button" onClick={onSignOut} aria-label="退出"><LogOut /></button>}</div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setSidebar(true)} aria-label="打开菜单"><Menu /></button>
          <div><h1>{viewTitle(view)}</h1><p>{view === "box" && selectedBox ? `${selectedBox.rows} × ${selectedBox.columns} · ${selectedBox.temperature ?? "温度未设置"}` : "样本库存与位置管理"}</p></div>
          <div className="top-actions"><span className="sync-status">{syncing ? "正在保存…" : mode === "cloud" ? <><Cloud size={14} /> 已同步</> : <><Database size={14} /> 本地保存</>}</span><button className="button secondary" onClick={undoLast}><ArchiveRestore size={16} /> 撤销</button>{selectedBox && <button className="button primary" onClick={selectedPositions.length ? openBatchRegistration : () => setNotice("请点击空孔位进行选择，可同时选择多个")}><Plus size={17} /> {selectedPositions.length ? `登记所选（${selectedPositions.length}）` : "选择孔位登记"}</button>}</div>
        </header>
        {(error || notice) && <div className={`banner ${error ? "error" : "success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X /></button></div>}
        <main className="content">
          {view === "box" && <BoxView state={state} box={selectedBox} openSlot={openSlot} query={query} setQuery={setQuery} onImport={handleImport} exportCsv={exportCsv} selectedPositions={selectedPositions} onRegister={openBatchRegistration} onClearSelection={() => setSelectedPositions([])} />}
          {view === "search" && <SearchView state={state} query={query} setQuery={setQuery} results={searchResults} onOpen={(sample) => setDraft(toDraft(state, sample))} />}
          {view === "audit" && <AuditView events={state.auditEvents} />}
          {view === "trash" && <TrashView samples={state.samples.filter((sample) => sample.status === "deleted" || sample.deletedAt)} restore={restoreSample} />}
          {view === "settings" && <SettingsView state={state} setState={setState} selectedBoxId={selectedBoxId} setSelectedBoxId={setSelectedBoxId} exportJson={exportJson} exportCsv={exportCsv} />}
        </main>
      </div>
      {draft && <SampleModal draft={draft} setDraft={setDraft} state={state} selectedCount={draft.id ? 1 : Math.max(selectedPositions.length, 1)} onSubmit={saveSample} onClose={() => { setDraft(null); setError(""); }} onCheckout={checkoutSample} onDelete={deleteSample} />}
      {importRows && <ImportModal rows={importRows} box={selectedBox} onCancel={() => setImportRows(null)} onConfirm={confirmImport} />}
      {storageManagerOpen && <StorageManager state={state} setState={setState} selectedBoxId={selectedBoxId} setSelectedBoxId={(id) => { setSelectedBoxId(id); setSelectedPositions([]); }} onClose={() => setStorageManagerOpen(false)} />}
    </div>
  );
}

function BoxView({ state, box, openSlot, query, setQuery, onImport, exportCsv, selectedPositions, onRegister, onClearSelection }: { state: InventoryState; box?: Box; openSlot: (r: number, c: number) => void; query: string; setQuery: (v: string) => void; onImport: (file: File) => void; exportCsv: () => void; selectedPositions: string[]; onRegister: () => void; onClearSelection: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const gridScrollerRef = useRef<HTMLDivElement>(null);
  const [slotSize, setSlotSize] = useState(44);

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
      <div className="legend"><span><i className="empty" />空孔</span><span><i className="selected" />已选择</span><span><i className="stored" />已存样品</span><span className="hint"><CircleHelp size={14} /> 点击空孔可连续多选</span></div>
      {selectedPositions.length > 0 && <div className="selection-bar"><div><strong>已选择 {selectedPositions.length} 个孔位</strong><span>{selectedPositions.join("、")}</span></div><div><button className="button secondary" onClick={onClearSelection}>取消选择</button><button className="button primary" onClick={onRegister}>批量登记</button></div></div>}
      <div ref={gridScrollerRef} className="grid-scroller" style={{ "--slot-size": `${slotSize}px` } as CSSProperties}><div className="box-grid" style={{ gridTemplateColumns: `34px repeat(${box.columns}, var(--slot-size))`, width: "max-content" }}><div className="corner" />{Array.from({ length: box.columns }, (_, c) => <div className="column-label" key={`head-${c}`}>{c + 1}</div>)}{Array.from({ length: box.rows }, (_, row) => <RowSlots key={row} row={row} box={box} state={state} query={query} openSlot={openSlot} selectedPositions={selectedPositions} />)}</div></div>
    </section>
    <aside className="panel box-info-rail">
      <div className="metric-stack"><div className="metric"><span>已占用</span><strong>{occupied}</strong><small>个孔位</small></div><div className="metric"><span>空余</span><strong>{box.rows * box.columns - occupied}</strong><small>个孔位</small></div><div className="metric"><span>使用率</span><strong>{Math.round((occupied / (box.rows * box.columns)) * 100)}%</strong><small>{box.rows * box.columns} 个总孔位</small></div></div>
      <div className="rail-tools"><div className="search-control"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="查找样品名称" /></div><input ref={fileRef} hidden type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} /><button className="button secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> 导入</button><button className="button secondary" onClick={exportCsv}><Download size={16} /> 导出</button></div>
    </aside>
  </div>;
}

function RowSlots({ row, box, state, query, openSlot, selectedPositions }: { row: number; box: Box; state: InventoryState; query: string; openSlot: (r: number, c: number) => void; selectedPositions: string[] }) {
  return <><div className="row-label">{rowLabel(row)}</div>{Array.from({ length: box.columns }, (_, column) => {
    const location = state.locations.find((item) => item.boxId === box.id && item.row === row && item.column === column && item.active);
    const sample = state.samples.find((item) => item.id === location?.sampleId);
    const dimmed = Boolean(query && sample && !`${sample.code} ${sample.name}`.toLowerCase().includes(query.toLowerCase()));
    const position = coordinate(row, column);
    const selected = selectedPositions.includes(position);
    return <button key={`${row}-${column}`} className={`slot ${sample ? "occupied" : ""} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`} style={sample ? { "--sample-color": validSampleColor(sample.customValues.cellColor) } as CSSProperties : undefined} onClick={() => openSlot(row, column)} aria-pressed={selected} aria-label={`${position} ${sample ? `${sample.name}，${sample.type}` : selected ? "已选择" : "空孔"}`}>{sample && <strong>{sample.name}</strong>}</button>;
  })}</>;
}

function SearchView({ state, query, setQuery, results, onOpen }: { state: InventoryState; query: string; setQuery: (v: string) => void; results: Sample[]; onOpen: (s: Sample) => void }) {
  return <section className="panel"><div className="panel-toolbar"><div className="search-control wide"><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索样品名称、类型、复苏皿规格、冰箱或冻存盒" /></div><span className="result-count">{results.length} 条结果</span></div><div className="table-scroll"><table><thead><tr><th>样品名称</th><th>样品类型</th><th>时间</th><th>复苏皿规格</th><th>存储位置</th><th>状态</th></tr></thead><tbody>{results.map((sample) => { const location = state.locations.find((item) => item.sampleId === sample.id && item.active); const box = state.boxes.find((item) => item.id === location?.boxId); return <tr key={sample.id} onClick={() => onOpen(sample)}><td><strong>{sample.name}</strong></td><td>{sample.type}</td><td>{sample.frozenAt || "—"}</td><td>{sample.dishSize}</td><td>{box ? `${box.name} · ${coordinate(location!.row, location!.column)}` : "已出库"}</td><td><Status status={sample.status} /></td></tr>; })}</tbody></table></div></section>;
}

function AuditView({ events }: { events: AuditEvent[] }) { return <section className="panel"><div className="panel-heading"><div><h2>操作记录</h2><p>审计记录不可从普通界面修改或删除。</p></div></div><div className="timeline">{events.map((event) => <div className="timeline-item" key={event.id}><span className={`timeline-icon ${event.action}`}><FileClock /></span><div><strong>{event.summary}</strong><p>{actionName(event.action)} · {new Date(event.createdAt).toLocaleString("zh-CN")}</p></div></div>)}</div></section>; }
function TrashView({ samples, restore }: { samples: Sample[]; restore: (s: Sample) => void }) { return <section className="panel"><div className="panel-heading"><div><h2>回收站</h2><p>样品记录不会在此处永久删除。</p></div></div>{samples.length ? <div className="trash-list">{samples.map((sample) => <div key={sample.id}><div><strong>{sample.name}</strong><p>{sample.frozenAt} · {sample.dishSize} · 删除于 {sample.deletedAt ? new Date(sample.deletedAt).toLocaleString("zh-CN") : "未知"}</p></div><button className="button secondary" onClick={() => restore(sample)}><ArchiveRestore size={16} /> 恢复并选择孔位</button></div>)}</div> : <EmptyState title="回收站为空" text="被软删除的样品会显示在这里。" />}</section>; }

function SettingsView({ state, setState, selectedBoxId, setSelectedBoxId, exportJson, exportCsv }: { state: InventoryState; setState: (s: InventoryState) => void; selectedBoxId: string; setSelectedBoxId: (id: string) => void; exportJson: () => void; exportCsv: () => void }) {
  function addFreezer() { const name = prompt("冰箱名称：")?.trim(); if (!name) return; const next = structuredClone(state); next.freezers.push({ id: uid("freezer"), name, location: prompt("所在位置（可选）：")?.trim() ?? "" }); setState(next); }
  function addRack() { if (!state.freezers.length) return alert("请先创建冰箱"); const name = prompt("层架名称：")?.trim(); if (!name) return; const next = structuredClone(state); next.racks.push({ id: uid("rack"), freezerId: state.freezers[0].id, name }); setState(next); }
  function addBox() { if (!state.racks.length) return alert("请先创建层架"); const name = prompt("冻存盒名称：")?.trim(); if (!name) return; const spec = prompt("规格：输入 9x9、10x10 或自定义行x列", "9x9")?.toLowerCase().match(/^(\d{1,2})\s*x\s*(\d{1,2})$/); if (!spec) return alert("规格格式无效"); const rows = Number(spec[1]), columns = Number(spec[2]); if (rows < 1 || columns < 1 || rows > 26 || columns > 30) return alert("当前支持 1–26 行、1–30 列"); const next = structuredClone(state); const id = uid("box"); next.boxes.push({ id, rackId: state.racks[0].id, name, rows, columns, temperature: "-80°C" }); setState(next); setSelectedBoxId(id); }
  function addField() { const name = prompt("自定义字段名称：")?.trim(); if (!name) return; const next = structuredClone(state); next.customFields.push({ id: uid("field"), name, required: confirm("是否设为必填字段？") }); setState(next); }
  return <div className="settings-grid"><section className="panel"><div className="panel-heading"><div><h2>存储结构</h2><p>当前首版新增层架和盒子默认归入第一个上级位置。</p></div></div><div className="settings-actions"><button className="button secondary" onClick={addFreezer}><Plus /> 新建冰箱</button><button className="button secondary" onClick={addRack}><Plus /> 新建层架</button><button className="button primary" onClick={addBox}><Plus /> 新建冻存盒</button></div><ul className="simple-list"><li>冰箱 <strong>{state.freezers.length}</strong></li><li>层架 <strong>{state.racks.length}</strong></li><li>冻存盒 <strong>{state.boxes.filter((b) => !b.deletedAt).length}</strong></li></ul></section><section className="panel"><div className="panel-heading"><div><h2>自定义字段</h2><p>字段会出现在所有样本录入表单中。</p></div><button className="button secondary" onClick={addField}><Plus /> 添加</button></div>{state.customFields.length ? <ul className="simple-list">{state.customFields.map((f) => <li key={f.id}>{f.name}<span>{f.required ? "必填" : "选填"}</span></li>)}</ul> : <EmptyState title="暂无自定义字段" text="标准字段已可直接使用。" />}</section><section className="panel"><div className="panel-heading"><div><h2>备份与导出</h2><p>JSON 包含全部库存、位置和审计记录；CSV 适合表格查看。</p></div></div><div className="settings-actions"><button className="button secondary" onClick={exportJson}><Download /> 完整 JSON</button><button className="button secondary" onClick={exportCsv}><Download /> 样本 CSV</button></div><div className="warning-note">浏览器演示数据不等同于备份。正式使用前必须配置 Supabase，并验证恢复流程。</div></section></div>;
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
    const name = prompt("新冰箱名称：")?.trim();
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
    const name = prompt("新层架名称：")?.trim();
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
    const name = prompt("新冻存盒名称：")?.trim();
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

function SampleModal({ draft, setDraft, state, selectedCount, onSubmit, onClose, onCheckout, onDelete }: { draft: SampleDraft; setDraft: (d: SampleDraft) => void; state: InventoryState; selectedCount: number; onSubmit: (e: React.FormEvent) => void; onClose: () => void; onCheckout: () => void; onDelete: () => void }) {
  const field = (key: keyof SampleDraft, value: unknown) => setDraft({ ...draft, [key]: value });
  const setCellColor = (value: string) => setDraft({ ...draft, customValues: { ...draft.customValues, cellColor: value } });
  const boxName = state.boxes.find((box) => box.id === draft.boxId)?.name ?? "冻存盒";
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal sample-modal compact-modal" role="dialog" aria-modal="true"><header><div><p className="eyebrow">{draft.id ? "样品详情" : "批量登记"}</p><h2>{draft.id ? `${draft.name} · ${draft.position}` : `${boxName} · 已选 ${selectedCount} 个孔位`}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header><form onSubmit={onSubmit}><div className="form-grid simple-form"><label className="full">样品名称 *<input autoFocus required value={draft.name} onChange={(e) => field("name", e.target.value)} placeholder="例如：ShMCAT、PM原代" /></label><label>样品类型 *<input required value={draft.type} onChange={(e) => field("type", e.target.value)} placeholder="例如：细胞系、原代细胞" list="sample-type-options" /><datalist id="sample-type-options"><option value="细胞系" /><option value="原代细胞" /><option value="类器官" /><option value="组织" /><option value="其他" /></datalist></label><fieldset className="color-field"><legend>单元格颜色 *</legend><div className="color-options">{SAMPLE_COLORS.map((color) => <button key={color.value} type="button" className={validSampleColor(draft.customValues.cellColor) === color.value ? "active" : ""} style={{ backgroundColor: color.value }} onClick={() => setCellColor(color.value)} aria-label={color.label} aria-pressed={validSampleColor(draft.customValues.cellColor) === color.value} title={color.label} />)}</div></fieldset><label>时间 *<input type="date" required value={draft.frozenAt} onChange={(e) => field("frozenAt", e.target.value)} /></label><label>复苏到多大的皿 *<input required value={draft.dishSize} onChange={(e) => field("dishSize", e.target.value)} placeholder="例如：6 cm 皿、10 cm 皿" list="dish-size-options" /><datalist id="dish-size-options"><option value="3.5 cm 皿" /><option value="6 cm 皿" /><option value="10 cm 皿" /><option value="15 cm 皿" /></datalist></label></div>{!draft.id && <div className="batch-note">将为所选 {selectedCount} 个孔位分别建立记录，样品名称、类型、颜色、时间和复苏皿规格保持一致。</div>}<footer><div>{draft.id && <><button type="button" className="button danger-ghost" onClick={onDelete}><Trash2 /> 移入回收站</button><button type="button" className="button secondary" onClick={onCheckout}>办理出库</button></>}</div><div><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary">{draft.id ? "保存修改" : `登记 ${selectedCount} 个孔位`}</button></div></footer></form></section></div>;
}

function ImportModal({ rows, box, onCancel, onConfirm }: { rows: Record<string, string>[]; box?: Box; onCancel: () => void; onConfirm: () => void }) { return <div className="modal-backdrop"><section className="modal"><header><div><p className="eyebrow">批量导入预览</p><h2>{rows.length} 条记录 → {box?.name}</h2></div><button className="icon-button" onClick={onCancel}><X /></button></header><div className="import-help">必需列：样品名称、时间、复苏皿规格、孔位。样品类型和单元格颜色可选；确认前不会写入任何数据。</div><div className="table-scroll"><table><thead><tr><th>行</th><th>样品名称</th><th>样品类型</th><th>颜色</th><th>时间</th><th>复苏皿规格</th><th>孔位</th></tr></thead><tbody>{rows.slice(0, 20).map((row, index) => <tr key={index}><td>{index + 2}</td><td>{row["样品名称"]}</td><td>{row["样品类型"] || "冻存样品"}</td><td>{row["单元格颜色"] || DEFAULT_SAMPLE_COLOR}</td><td>{row["时间"]}</td><td>{row["复苏皿规格"]}</td><td>{row["孔位"]}</td></tr>)}</tbody></table></div><footer><span>{rows.length > 20 ? `仅预览前 20 条，共 ${rows.length} 条` : `共 ${rows.length} 条`}</span><div><button className="button secondary" onClick={onCancel}>取消</button><button className="button primary" onClick={onConfirm}>校验并导入</button></div></footer></section></div>; }

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>; }
function Status({ status }: { status: Sample["status"] }) { return <span className={`status ${status}`}>{status === "stored" ? "在库" : status === "checked_out" ? "已出库" : "已删除"}</span>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><BoxIcon /><strong>{title}</strong><p>{text}</p></div>; }
function viewTitle(view: View) { return ({ box: "冻存盒", search: "样本检索", audit: "操作记录", trash: "回收站", settings: "系统设置" })[view]; }
function actionName(action: AuditEvent["action"]) { return ({ create: "新增", update: "修改", move: "移动", checkout: "出库", restore: "恢复", delete: "删除", import: "导入" })[action]; }
function firstAvailable(state: InventoryState, box: Box) { for (let row = 0; row < box.rows; row++) for (let column = 0; column < box.columns; column++) if (!state.locations.some((l) => l.active && l.boxId === box.id && l.row === row && l.column === column)) return coordinate(row, column); return null; }
function toDraft(state: InventoryState, sample: Sample): SampleDraft { const location = state.locations.find((l) => l.sampleId === sample.id && l.active); const box = state.boxes.find((b) => b.id === location?.boxId) ?? state.boxes.find((b) => !b.deletedAt); return { ...sample, boxId: box?.id ?? "", position: location ? coordinate(location.row, location.column) : box ? firstAvailable(state, box) ?? "A1" : "A1" }; }
function dateStamp() { return new Date().toISOString().slice(0, 10); }
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
