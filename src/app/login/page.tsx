"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/chat";
  // 是否通过管理后台入口登录
  const isAdminEntrance = from.startsWith("/admin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await api.login(email, password);
      // 通过管理员入口登录但非管理员 → 提示
      if (isAdminEntrance && user.role !== "admin") {
        setError("该账号不是管理员，无法进入管理后台");
        setLoading(false);
        return;
      }
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-center text-2xl font-semibold">
        {isAdminEntrance ? "管理员登录" : "登录"}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-neutral-600">邮箱</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">密码</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
            placeholder="••••••"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-neutral-900 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "登录中…" : isAdminEntrance ? "登录管理后台" : "登录"}
        </button>
      </form>

      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-neutral-500">
        <p>
          还没有账号？{" "}
          <Link href="/register" className="text-neutral-900 underline">
            注册
          </Link>
        </p>
        {/* 管理后台入口 */}
        {isAdminEntrance ? (
          <Link href="/login" className="text-neutral-600 hover:text-neutral-900">
            ← 返回普通登录
          </Link>
        ) : (
          <Link
            href="/login?from=/admin/dashboard"
            className="text-neutral-600 hover:text-neutral-900"
          >
            管理后台登录 →
          </Link>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <Suspense fallback={<div className="text-neutral-400">加载中…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
