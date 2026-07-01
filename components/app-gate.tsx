"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Cloud, FlaskConical, LoaderCircle, Mail } from "lucide-react";
import { cloudConfigured, createSupabase } from "@/lib/cloud";
import { InventoryApp } from "./inventory-app";
import { PwaRegister } from "./pwa-register";

export function AppGate() {
  const supabase = useMemo(() => createSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(cloudConfigured);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (loading) return <main className="center-screen"><LoaderCircle className="spin" /> 正在验证登录状态…</main>;
  if (session) return <><PwaRegister /><InventoryApp mode="cloud" userEmail={session.user.email} onSignOut={() => { setShowLogin(true); void supabase?.auth.signOut(); }} /></>;
  if (!showLogin) return <><PwaRegister /><InventoryApp mode="demo" onSignIn={() => setShowLogin(true)} /></>;

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage("云端登录尚未配置。部署前需要填写 Supabase 项目地址和匿名密钥。");
      return;
    }
    setMessage("正在发送…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setMessage(error ? `发送失败：${error.message}` : "登录链接已发送，请检查邮箱。该系统不提供公开密码注册。 ");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark"><FlaskConical /></div>
        <p className="eyebrow"><Cloud size={14} /> 安全云端库存</p>
        <h1>冻存盒管理系统</h1>
        <p className="muted">使用授权邮箱接收一次性登录链接。请勿录入患者姓名、住院号等直接身份信息。</p>
        {!cloudConfigured && <p className="login-warning">当前尚未连接云端数据库，登录暂不可用。配置完成后此处会自动启用。</p>}
        <form onSubmit={sendMagicLink} className="stack">
          <label>邮箱地址<input type="email" required disabled={!cloudConfigured} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@lab.edu" /></label>
          <button className="button primary" disabled={!cloudConfigured} type="submit"><Mail size={17} /> 发送登录链接</button>
          <button className="button secondary" type="button" onClick={() => { setShowLogin(false); setMessage(""); }}><ArrowLeft size={17} /> 返回本地模式</button>
        </form>
        {message && <p className="form-message">{message}</p>}
      </section>
    </main>
  );
}
