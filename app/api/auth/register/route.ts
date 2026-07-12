import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { clientAddress, hashPassword, rateLimit, setSession } from "@/lib/server/auth";
import { demoState } from "@/lib/demo-data";

export async function POST(request: Request) {
  if (process.env.REGISTRATION_ENABLED === "false") return NextResponse.json({ error: "当前已关闭新用户注册" }, { status: 403 });
  if (!rateLimit(`register:${clientAddress(request.headers)}`, 5)) return NextResponse.json({ error: "注册请求过于频繁，请稍后再试" }, { status: 429 });
  try {
    const body = await request.json() as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "密码至少 8 位，并同时包含字母和数字" }, { status: 400 });
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const pool = getPool();
    const connection = await pool.connect();
    let user: { id: string; email: string };
    try {
      await connection.query("begin");
      const result = await connection.query<{ id: string; email: string }>("insert into app_users (id, email, password_hash) values ($1, $2, $3) returning id, email", [id, email, passwordHash]);
      user = result.rows[0];
      await connection.query("insert into inventory_snapshots (user_id, payload, version) values ($1, $2::jsonb, 1)", [user.id, JSON.stringify(demoState)]);
      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
    await setSession(user);
    return NextResponse.json({ user });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return NextResponse.json({ error: "该邮箱已经注册" }, { status: 409 });
    return NextResponse.json({ error: "注册失败，请检查服务器数据库配置" }, { status: 500 });
  }
}
