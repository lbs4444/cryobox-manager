import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { getPool } from "@/lib/server/db";
import { parseInventoryState } from "@/lib/server/inventory";
import { demoState } from "@/lib/demo-data";

async function ensureSnapshot(userId: string) {
  await getPool().query("insert into inventory_snapshots (user_id, payload, version) values ($1, $2::jsonb, 1) on conflict (user_id) do nothing", [userId, JSON.stringify(demoState)]);
  return getPool().query<{ payload: unknown; version: number }>("select payload, version from inventory_snapshots where user_id = $1", [userId]);
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const result = await ensureSnapshot(user.id);
    const row = result.rows[0];
    return NextResponse.json({ state: parseInventoryState(row.payload), version: row.version, user });
  } catch { return NextResponse.json({ error: "读取库存失败，请检查数据库" }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const body = await request.json() as { state?: unknown; version?: number };
    const state = parseInventoryState(body.state);
    if (!Number.isInteger(body.version) || (body.version ?? 0) < 1) return NextResponse.json({ error: "库存版本无效" }, { status: 400 });
    const result = await getPool().query<{ version: number }>("update inventory_snapshots set payload = $1::jsonb, version = version + 1, updated_at = now() where user_id = $2 and version = $3 returning version", [JSON.stringify(state), user.id, body.version]);
    if (!result.rows[0]) {
      const current = await ensureSnapshot(user.id);
      return NextResponse.json({ error: "库存已被其他设备更新，请刷新后再试", state: current.rows[0]?.payload, version: current.rows[0]?.version }, { status: 409 });
    }
    return NextResponse.json({ version: result.rows[0].version });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "库存数据格式无效" }, { status: 400 });
    return NextResponse.json({ error: "保存库存失败，请检查数据库" }, { status: 500 });
  }
}
