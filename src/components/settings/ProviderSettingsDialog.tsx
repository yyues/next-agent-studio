"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { api, type PublicConfig, type ProviderSettings, type TestConnectionResult, type UserInfo } from "@/lib/api";

interface Props {
  user: UserInfo | null;
  initialConfig: PublicConfig;
  savedSettings: ProviderSettings | null;
  onClose: () => void;
  onSaved: (s: ProviderSettings & { apiKey?: string }) => void;
  onCleared: () => void;
}

export function ProviderSettingsDialog({
  user,
  initialConfig,
  savedSettings,
  onClose,
  onSaved,
  onCleared,
}: Props) {
  const [baseUrl, setBaseUrl] = useState(
    savedSettings?.baseUrl ?? initialConfig.defaultBaseUrl ?? "https://openrouter.ai/api/v1",
  );
  const [model, setModel] = useState(
    savedSettings?.model ?? initialConfig.defaultModel ?? "openai/gpt-4o-mini",
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [error, setError] = useState("");

  const isEditing = !!savedSettings;

  // 掩码：隐藏时只显示首尾，中间用 · 替代
  function maskKey(key: string): string {
    if (!key) return "";
    if (key.length <= 8) return "•".repeat(key.length);
    return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!baseUrl.trim() || !model.trim()) {
      setError("API 路径和模型 ID 不能为空");
      return;
    }
    if (!apiKey.trim()) {
      setError(isEditing ? "请重新输入 API Key（出于安全不回显原值）" : "API Key 不能为空");
      return;
    }
    setSaving(true);
    try {
      if (user) {
        const settings = await api.saveProviderSettings({
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKey: apiKey.trim(),
        });
        onSaved(settings);
      } else {
        const raw = apiKey.trim();
        const hint =
          raw.length <= 8
            ? "•".repeat(raw.length)
            : `${raw.slice(0, 4)}${"•".repeat(4)}${raw.slice(-4)}`;
        onSaved({
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKeyHint: hint,
          hasApiKey: true,
          apiKey: raw,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setError("");
    setTesting(true);
    setTestResult(null);
    try {
      const input =
        apiKey.trim() && baseUrl.trim() && model.trim()
          ? { apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() }
          : undefined;
      const result = await api.testProviderConnection(input);
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : "测试失败" });
    } finally {
      setTesting(false);
    }
  }

  async function handleClear() {
    if (!user) {
      onCleared();
      return;
    }
    try {
      await api.deleteProviderSettings();
      onCleared();
    } catch (e) {
      setError(e instanceof Error ? e.message : "清除失败");
    }
  }

  return (
    <Dialog open onClose={onClose} title="API 设置">
      <p className="text-sm text-neutral-500 mb-4">
        {user
          ? "配置保存在你的账户下，API Key 加密存储。"
          : "游客配置仅本次会话有效，登录后可持久保存。"}{" "}
        留空使用服务端默认配置
        {initialConfig.hasDefaultProvider ? "（已配置）" : "（未配置，需填写）"}。
      </p>
      {/*
        修复 Chrome 密码管理器弹窗的唯一可靠方案：
        1. API Key 用 type="text" 而非 type="password"——Chrome 密码管理器只识别 type="password"
        2. form 级 autoComplete="new-password" 明确告诉浏览器这不是登录表单
        3. 加眼睛按钮让用户可切换显示/隐藏
      */}
      <form
        onSubmit={handleSave}
        className="space-y-3"
        autoComplete="new-password"
      >
        <div>
          <label className="block text-sm mb-1 text-neutral-600">API 路径（Base URL）</label>
          <input
            name="base-url"
            autoComplete="off"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
            placeholder="https://openrouter.ai/api/v1"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-neutral-600">
            API Key
            {isEditing && savedSettings?.apiKeyHint && (
              <span className="text-neutral-400 ml-2">当前：{savedSettings.apiKeyHint}</span>
            )}
          </label>
          <div className="relative">
            <input
              type="text"
              name="api-key"
              autoComplete="off"
              spellCheck={false}
              value={showKey ? apiKey : maskKey(apiKey)}
              onChange={(e) => {
                // 隐藏模式下用户直接编辑时自动切换到显示模式，避免把掩码写回
                if (!showKey && e.target.value !== maskKey(apiKey)) {
                  setShowKey(true);
                }
                setApiKey(e.target.value);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 pr-12 outline-none focus:border-neutral-900 font-mono"
              placeholder={isEditing ? "输入新 Key 以替换" : "sk-or-..."}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-sm px-1"
              title={showKey ? "隐藏" : "显示"}
              tabIndex={-1}
            >
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm mb-1 text-neutral-600">模型 ID</label>
          <input
            name="model-id"
            autoComplete="off"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
            placeholder="openai/gpt-4o-mini"
          />
        </div>

        {testResult && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {testResult.ok
              ? `连接成功${testResult.model ? ` · ${testResult.model}` : ""}`
              : `连接失败：${testResult.error ?? "未知错误"}`}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleTest}
          disabled={testing || (!apiKey.trim() && !savedSettings && !initialConfig.hasDefaultProvider)}
          className="w-full rounded-lg border border-neutral-300 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
        >
          {testing ? "测试中…" : "测试连接"}
        </button>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-neutral-900 text-white py-2 font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {(savedSettings || !user) && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              清除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            取消
          </button>
        </div>
      </form>
    </Dialog>
  );
}
