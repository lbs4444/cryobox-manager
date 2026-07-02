"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { cloudConfigured, createSupabase } from "@/lib/cloud";
import { InventoryApp } from "./inventory-app";
import { PwaRegister } from "./pwa-register";

export function AppGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(cloudConfigured);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const client = createSupabase();
    if (!client) return;
    client.auth.getSession().then((result: { data: { session: Session | null } }) => { setSession(result.data.session); setChecking(false); });
    const { data } = client.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
      setSession(nextSession);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const client = createSupabase();
    if (!client) return;
    setSubmitting(true);
    setMessage("");
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) setMessage(error.message === "Invalid login credentials" ? "邮箱或密码错误" : error.message);
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    const client = createSupabase();
    if (!client) return;
    setMessage("");
    if (password.length < 8) return setMessage("密码至少需要 8 位");
    if (password !== passwordConfirmation) return setMessage("两次输入的密码不一致");
    setSubmitting(true);
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (!data.session) {
      setMessage("注册成功。请查收确认邮件，点击邮件中的链接后再登录。");
      setAuthMode("login");
      setPassword("");
      setPasswordConfirmation("");
    }
  }

  function switchMode(mode: "login" | "register") {
    setAuthMode(mode);
    setMessage("");
    setPassword("");
    setPasswordConfirmation("");
  }

  async function signOut() {
    await createSupabase()?.auth.signOut();
  }

  async function changePassword(password: string) {
    const client = createSupabase();
    if (!client) return "未连接 Supabase";
    const { error } = await client.auth.updateUser({ password });
    return error?.message ?? null;
  }

  if (!cloudConfigured) return <SetupRequired />;
  if (checking) return <main className="center-screen"><LoaderCircle className="spin" /> 正在检查登录状态…</main>;
  if (session) return <><PwaRegister /><InventoryApp mode="cloud" userEmail={session.user.email ?? "已登录用户"} onSignOut={signOut} onChangePassword={changePassword} /></>;

  const registering = authMode === "register";
  return <main className="login-page"><section className="login-card"><span className="brand-mark"><FlaskConical /></span><p className="eyebrow">冻存盒管理系统</p><h1>{registering ? "注册账号" : "登录"}</h1><p className="muted">{registering ? "使用自己的邮箱注册。每个账号都有独立的云端库存。" : "登录后访问自己的云端库存，不同账号的数据完全隔离。"}</p><form className="stack" onSubmit={registering ? signUp : signIn}><label>邮箱<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>密码<input type="password" autoComplete={registering ? "new-password" : "current-password"} required minLength={registering ? 8 : 6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{registering && <label>再次输入密码<input type="password" autoComplete="new-password" required minLength={8} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>}{message && <div className="form-message">{message}</div>}<button className="button primary" type="submit" disabled={submitting}>{submitting ? registering ? "正在注册…" : "正在登录…" : registering ? "注册" : "登录"}</button></form><div className="auth-switch">{registering ? <>已有账号？<button type="button" onClick={() => switchMode("login")}>返回登录</button></> : <>还没有账号？<button type="button" onClick={() => switchMode("register")}>自助注册</button></>}</div></section></main>;
}

function SetupRequired() {
  return <main className="login-page"><section className="login-card"><span className="brand-mark"><FlaskConical /></span><p className="eyebrow">需要配置</p><h1>云端登录尚未连接</h1><p className="muted">请在 <code>.env.local</code> 中配置 Supabase 项目地址和公开匿名密钥，然后重启系统。这两项是前端可公开配置，不要填写 service role 密钥。</p></section></main>;
}
