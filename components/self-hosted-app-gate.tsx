"use client";

import { useEffect, useState } from "react";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { getSelfHostedSession, selfHostedLogin, selfHostedLogout, selfHostedRegister } from "@/lib/self-hosted";
import { InventoryApp } from "./inventory-app";
import { PwaRegister } from "./pwa-register";

type User = { id: string; email: string };

export function SelfHostedAppGate() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getSelfHostedSession().then(({ user: next }) => setUser(next)).catch(() => setMessage("无法连接本地服务器")).finally(() => setChecking(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (registering && password !== confirmation) return setMessage("两次输入的密码不一致");
    setSubmitting(true);
    try {
      const result = registering ? await selfHostedRegister(email, password) : await selfHostedLogin(email, password);
      setUser(result.user);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "请求失败");
    } finally { setSubmitting(false); }
  }

  async function signOut() {
    await selfHostedLogout();
    setUser(null);
  }

  if (checking) return <main className="center-screen"><LoaderCircle className="spin" /> 正在检查本地服务器…</main>;
  if (user) return <><PwaRegister /><InventoryApp mode="self-hosted" userEmail={user.email} onSignOut={signOut} /></>;

  return <main className="login-page"><section className="login-card"><span className="brand-mark"><FlaskConical /></span><p className="eyebrow">冻存盒管理系统 · ECS版</p><h1>{registering ? "注册账号" : "登录"}</h1><p className="muted">数据保存在实验室自有服务器。账号之间的库存相互隔离。</p><form className="stack" onSubmit={submit}><label>邮箱<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>密码<input type="password" autoComplete={registering ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{registering && <label>再次输入密码<input type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}{message && <div className="form-message">{message}</div>}<button className="button primary" type="submit" disabled={submitting}>{submitting ? "请稍候…" : registering ? "注册" : "登录"}</button></form><div className="auth-switch">{registering ? <>已有账号？<button type="button" onClick={() => { setRegistering(false); setMessage(""); }}>返回登录</button></> : <>还没有账号？<button type="button" onClick={() => { setRegistering(true); setMessage(""); }}>自助注册</button></>}</div><div className="login-warning">当前为自托管版本。正式使用前请配置域名和 HTTPS；不要在未加密的公网 IP 页面输入真实密码。</div></section></main>;
}
