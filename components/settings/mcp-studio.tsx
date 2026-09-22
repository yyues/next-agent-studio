"use client";

import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import {
  AlertCircleIcon,
  ChevronRightIcon,
  Clock3Icon,
  CopyIcon,
  Loader2Icon,
  PlayIcon,
  PlugZapIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StudioServer = {
  serverId: string;
  name: string;
  type: "http" | "stdio";
  url: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  source?: "own" | "global" | "role";
};

type StudioTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  risk: "read" | "write" | "unknown";
};

type StudioLog = {
  invocationId: string;
  serverId: string;
  toolName: string;
  status: "success" | "error" | "timeout" | "denied";
  durationMs: number;
  argumentSummary: string;
  resultSummary?: string;
  errorMessage?: string;
  createdAt: string;
};

type McpStudioProps = {
  roleId?: string;
  admin?: boolean;
};

const riskLabel: Record<StudioTool["risk"], string> = {
  read: "只读",
  write: "写入",
  unknown: "需确认",
};

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const McpStudio: FC<McpStudioProps> = ({ roleId = "general", admin = false }) => {
  const [servers, setServers] = useState<StudioServer[]>([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [tools, setTools] = useState<StudioTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState("");
  const [argsText, setArgsText] = useState("{}\n");
  const [resultText, setResultText] = useState("");
  const [resultStatus, setResultStatus] = useState<string>("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<StudioLog[]>([]);
  const [invoking, setInvoking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const base = admin ? "/api/admin/mcp" : "/api/settings/mcp";
  const selectedServer = servers.find((server) => server.serverId === selectedServerId);
  const selectedTool = tools.find((tool) => tool.name === selectedToolName);

  const loadLogs = useCallback(async () => {
    const res = await fetch(`${base}/invocations?limit=50`);
    if (!res.ok) return;
    const data = (await res.json()) as { logs?: StudioLog[] };
    setLogs(data.logs ?? []);
  }, [base]);

  const loadServers = useCallback(async () => {
    setServersLoading(true);
    setError("");
    try {
      const query = admin ? "" : `?roleId=${encodeURIComponent(roleId)}`;
      const res = await fetch(admin ? `${base}` : `${base}/servers${query}`);
      if (!res.ok) throw new Error("无法加载 MCP 服务器");
      const data = (await res.json()) as { servers?: StudioServer[] };
      const next = data.servers ?? [];
      setServers(next);
      setSelectedServerId((current) => current || next[0]?.serverId || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法加载 MCP 服务器");
    } finally {
      setServersLoading(false);
    }
  }, [admin, base, roleId]);

  const inspectServer = useCallback(
    async (serverId: string) => {
      if (!serverId) return;
      setToolsLoading(true);
      setError("");
      setTools([]);
      setSelectedToolName("");
      try {
        const query = admin ? "" : `?roleId=${encodeURIComponent(roleId)}`;
        const url = admin
          ? `${base}/${encodeURIComponent(serverId)}/tools`
          : `${base}/servers/${encodeURIComponent(serverId)}/tools${query}`;
        const res = await fetch(url);
        const data = (await res.json()) as { tools?: StudioTool[]; error?: string };
        if (!res.ok) throw new Error(data.error || "连接 MCP 服务器失败");
        const next = data.tools ?? [];
        setTools(next);
        setSelectedToolName(next[0]?.name ?? "");
      } catch (inspectError) {
        setError(inspectError instanceof Error ? inspectError.message : "连接 MCP 服务器失败");
      } finally {
        setToolsLoading(false);
      }
    },
    [admin, base, roleId],
  );

  useEffect(() => {
    void loadServers();
    void loadLogs();
  }, [loadLogs, loadServers]);

  useEffect(() => {
    if (selectedServerId) void inspectServer(selectedServerId);
  }, [inspectServer, selectedServerId]);

  useEffect(() => {
    if (selectedTool) setArgsText(`${prettyJson(selectedTool.inputSchema.properties ? {} : {})}\n`);
  }, [selectedTool]);

  const invoke = async (confirmed: boolean) => {
    if (!selectedServer || !selectedTool || invoking) return;
    let parsed: Record<string, unknown>;
    try {
      const value = JSON.parse(argsText);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("参数必须是 JSON 对象");
      parsed = value as Record<string, unknown>;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "参数 JSON 格式错误");
      return;
    }

    setInvoking(true);
    setError("");
    setResultText("");
    setResultStatus("调用中");
    try {
      const url = admin
        ? `${base}/${encodeURIComponent(selectedServer.serverId)}/invoke`
        : `${base}/servers/${encodeURIComponent(selectedServer.serverId)}/invoke`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          toolName: selectedTool.name,
          arguments: parsed,
          confirmed,
        }),
      });
      const data = (await res.json()) as { status?: string; result?: unknown; error?: string };
      if (res.status === 409) {
        setConfirming(true);
        setResultStatus("需要确认");
        return;
      }
      if (!res.ok || data.status !== "success") throw new Error(data.error || "工具调用失败");
      setResultStatus("调用成功");
      setResultText(prettyJson(data.result));
      await loadLogs();
    } catch (invokeError) {
      setResultStatus("调用失败");
      setError(invokeError instanceof Error ? invokeError.message : "工具调用失败");
      await loadLogs();
    } finally {
      setInvoking(false);
    }
  };

  const copyResult = async () => {
    if (resultText) await navigator.clipboard.writeText(resultText);
  };

  const selectedToolSchema = useMemo(
    () => prettyJson(selectedTool?.inputSchema ?? {}),
    [selectedTool],
  );
  const schemaFields = useMemo(() => {
    const schema = selectedTool?.inputSchema;
    if (!schema || typeof schema.properties !== "object" || !schema.properties) return [];
    const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
    return Object.entries(schema.properties as Record<string, unknown>).map(([name, value]) => {
      const field = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return {
        name,
        type: typeof field.type === "string" ? field.type : "any",
        description: typeof field.description === "string" ? field.description : "",
        required: required.has(name),
      };
    });
  }, [selectedTool]);

  const formatArguments = () => {
    try {
      setArgsText(`${JSON.stringify(JSON.parse(argsText), null, 2)}\n`);
      setValidationMessage("JSON 格式正确");
    } catch {
      setValidationMessage("JSON 格式错误");
    }
  };

  const validateArguments = () => {
    try {
      const parsed = JSON.parse(argsText) as Record<string, unknown>;
      const missing = schemaFields.filter(
        (field) => field.required && parsed[field.name] === undefined,
      );
      setValidationMessage(
        missing.length > 0
          ? `缺少必填字段：${missing.map((field) => field.name).join("、")}`
          : "参数通过基础校验",
      );
    } catch {
      setValidationMessage("JSON 格式错误");
    }
  };

  return (
    <div className="grid min-h-[620px] w-full min-w-0 max-w-full gap-4 xl:grid-cols-[240px_280px_minmax(0,1fr)]">
      <section className="border-border/60 bg-card/70 min-w-0 rounded-xl border p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              MCP Studio
            </p>
            <h2 className="mt-1 text-sm font-semibold">服务器</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void loadServers()}
            aria-label="刷新服务器"
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
        </div>
        {serversLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-1 py-8 text-xs">
            <Loader2Icon className="size-3.5 animate-spin" />
            加载服务器…
          </div>
        ) : servers.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs leading-5">
            当前角色还没有可调试的 MCP 服务器。
          </div>
        ) : (
          <div className="grid gap-1.5">
            {servers.map((server) => (
              <button
                key={server.serverId}
                type="button"
                onClick={() => setSelectedServerId(server.serverId)}
                className={cn(
                  "group flex w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
                  selectedServerId === server.serverId
                    ? "border-primary/35 bg-primary/[0.045] shadow-[inset_3px_0_0_var(--color-primary)]"
                    : "border-border/35 bg-background/35 hover:border-primary/25 hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    selectedServerId === server.serverId
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <PlugZapIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{server.name}</span>
                  <span className="text-muted-foreground block truncate font-mono text-[10px]">
                    {server.serverId} · {server.type}
                    {!admin && server.source
                      ? ` · ${server.source === "global" ? "全局" : server.source === "role" ? "引用" : "当前角色"}`
                      : ""}
                  </span>
                </span>
                <ChevronRightIcon
                  className={cn(
                    "size-3.5 shrink-0 transition-colors",
                    selectedServerId === server.serverId
                      ? "text-primary"
                      : "text-muted-foreground opacity-60",
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="border-border/60 bg-card/70 min-w-0 rounded-xl border p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-chart-2 uppercase">
              Tool map
            </p>
            <h2 className="mt-1 text-sm font-semibold">工具列表</h2>
          </div>
          {toolsLoading && <Loader2Icon className="text-muted-foreground size-4 animate-spin" />}
        </div>
        {!selectedServer ? (
          <p className="text-muted-foreground px-1 py-8 text-xs">选择一个服务器查看工具。</p>
        ) : tools.length === 0 && !toolsLoading ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs leading-5">
            没有发现可用工具，或连接失败。
          </p>
        ) : (
          <div className="grid gap-1.5">
            {tools.map((tool) => (
              <button
                key={tool.name}
                type="button"
                onClick={() => setSelectedToolName(tool.name)}
                className={cn(
                  "w-full min-w-0 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-chart-2/40",
                  selectedToolName === tool.name
                    ? "border-chart-2/40 bg-chart-2/8"
                    : "border-transparent hover:border-border/70 hover:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <WrenchIcon className="text-chart-2 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{tool.name}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      tool.risk === "read"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : tool.risk === "write"
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {riskLabel[tool.risk]}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px]">
                  {tool.description || "未提供描述"}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="border-border/60 bg-card/70 min-w-0 max-w-full overflow-hidden rounded-xl border p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-chart-4 uppercase">
              Invocation desk
            </p>
            <h2 className="mt-1 truncate text-base font-semibold">
              {selectedTool?.name || "选择一个工具开始调试"}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {selectedTool?.description || "连接 MCP 后查看工具参数、执行结果和最近调用记录。"}
            </p>
          </div>
          {selectedTool && (
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[10px] font-medium",
                selectedTool.risk === "read"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-amber-500/10 text-amber-600",
              )}
            >
              {riskLabel[selectedTool.risk]}
            </span>
          )}
        </div>
        {selectedTool && (
          <div className="mt-4 grid min-w-0 max-w-full gap-4 overflow-hidden">
            {schemaFields.length > 0 && (
              <div className="grid min-w-0 gap-1.5">
                {schemaFields.map((field) => (
                  <div
                    key={field.name}
                    className="grid min-w-0 grid-cols-[minmax(100px,0.7fr)_70px_minmax(0,1.4fr)] items-start gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-[11px]"
                  >
                    <span className="min-w-0 break-all font-mono font-medium">
                      {field.name}
                      {field.required && <span className="text-destructive"> *</span>}
                    </span>
                    <span className="text-chart-2 min-w-0 break-all font-mono">{field.type}</span>
                    <span className="text-muted-foreground min-w-0 [overflow-wrap:anywhere]">
                      {field.description || "无字段说明"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium">参数 JSON</label>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={formatArguments}
                  >
                    格式化 JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={validateArguments}
                  >
                    校验参数
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setArgsText(prettyJson({}) + "\n");
                      setValidationMessage("");
                    }}
                  >
                    清空
                  </Button>
                </div>
              </div>
              <textarea
                wrap="soft"
                value={argsText}
                onChange={(event) => {
                  setArgsText(event.target.value);
                  setValidationMessage("");
                }}
                spellCheck={false}
                className="bg-background border-input min-h-40 w-full min-w-0 max-w-full resize-y rounded-lg border p-3 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              {validationMessage && (
                <p
                  className={cn(
                    "text-xs",
                    validationMessage.includes("错误") || validationMessage.includes("缺少")
                      ? "text-destructive"
                      : "text-emerald-600",
                  )}
                >
                  {validationMessage}
                </p>
              )}
            </div>
            <details className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/60">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                查看完整 input schema
              </summary>
              <pre className="bg-muted/40 max-h-56 max-w-full overflow-y-auto border-t border-border/60 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
                {selectedToolSchema}
              </pre>
            </details>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void invoke(false)} disabled={invoking} className="gap-1.5">
                <PlayIcon className="size-3.5" />
                {invoking ? "调用中…" : "执行工具"}
              </Button>
              <span className="text-muted-foreground text-xs">写入类工具执行前会要求确认</span>
            </div>
            {error && (
              <div className="border-destructive/30 bg-destructive/5 text-destructive flex min-w-0 items-start gap-2 rounded-lg border p-3 text-xs [overflow-wrap:anywhere]">
                <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </div>
            )}
            {resultStatus && (
              <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{resultStatus}</span>
                  {resultText && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => void copyResult()}
                    >
                      <CopyIcon className="size-3" />
                      复制
                    </Button>
                  )}
                </div>
                {resultText && (
                  <pre className="bg-muted/40 mt-2 max-h-64 max-w-full overflow-y-auto rounded-md p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
                    {resultText}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 min-w-0 border-t border-border/60 pt-4">
          <div className="mb-2 flex items-center gap-2">
            <Clock3Icon className="text-muted-foreground size-3.5" />
            <h3 className="text-xs font-semibold">最近调用</h3>
          </div>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-xs">暂无调用记录。</p>
          ) : (
            <div className="grid min-w-0 gap-1.5">
              {logs.slice(0, 8).map((log) => (
                <details
                  key={log.invocationId}
                  className="min-w-0 max-w-full overflow-hidden rounded-md bg-muted/40 text-[11px]"
                >
                  <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-2">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        log.status === "success"
                          ? "bg-emerald-500"
                          : log.status === "denied"
                            ? "bg-amber-500"
                            : "bg-destructive",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {log.serverId} / {log.toolName}
                    </span>
                    <span className="text-muted-foreground shrink-0">{log.durationMs}ms</span>
                  </summary>
                  <div className="grid min-w-0 gap-2 border-t border-border/50 px-3 py-2">
                    <div className="min-w-0">
                      <span className="text-muted-foreground">参数摘要</span>
                      <pre className="mt-1 max-w-full overflow-y-auto whitespace-pre-wrap break-all font-mono [overflow-wrap:anywhere]">
                        {log.argumentSummary || "{}"}
                      </pre>
                    </div>
                    {log.resultSummary && (
                      <div className="min-w-0">
                        <span className="text-muted-foreground">结果摘要</span>
                        <pre className="mt-1 max-w-full overflow-y-auto whitespace-pre-wrap break-all font-mono [overflow-wrap:anywhere]">
                          {log.resultSummary}
                        </pre>
                      </div>
                    )}
                    {log.errorMessage && (
                      <p className="text-destructive [overflow-wrap:anywhere]">
                        {log.errorMessage}
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-card w-full max-w-md rounded-xl border border-border/70 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="bg-amber-500/10 text-amber-600 flex size-9 shrink-0 items-center justify-center rounded-lg">
                <ShieldAlertIcon className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold">确认执行可能写入外部系统的工具？</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {selectedTool?.name} 可能创建、修改、发送或删除外部数据。确认后将直接调用 MCP
                  server。
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  setConfirming(false);
                  void invoke(true);
                }}
              >
                确认执行
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
