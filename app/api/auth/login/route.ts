import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { clientAddress, rateLimit, setSession, verifyPassword } from "@/lib/server/auth";

export async function POST(request: Request) {
  if (!rateLimit(`login:${clientAddress(request.headers)}`, 15)) return NextResponse.json({ error: "登录尝试过于频繁，请稍后再试" }, { status: 429 });
  try {
    const body = await request.json() as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const result = await getPool().query<{ id: string; email: string; password_hash: string }>("select id, email, password_hash from app_users where email = $1", [email]);
    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password ?? "", user.password_hash))) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    await setSession({ id: user.id, email: user.email });
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch { return NextResponse.json({ error: "登录失败，请检查服务器数据库配置" }, { status: 500 }); }
}
