"use client";

import { useState } from "react";
import { Modal, Form, Input, Button, App as AntdApp, Tooltip, Divider } from "antd";
import {
  api,
  type PublicConfig,
  type ProviderSettings,
  type TestConnectionResult,
  type UserInfo,
} from "@/lib/api";

interface Props {
  user: UserInfo | null;
  initialConfig: PublicConfig;
  savedSettings: ProviderSettings | null;
  open: boolean;
  onClose: () => void;
  onSaved: (s: ProviderSettings & { apiKey?: string }) => void;
  onCleared: () => void;
}

export function ProviderSettingsDialog({
  user,
  initialConfig,
  savedSettings,
  open,
  onClose,
  onSaved,
  onCleared,
}: Props) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const isEditing = !!savedSettings;

  async function handleSave(values: { baseUrl: string; model: string; apiKey: string }) {
    setSaving(true);
    try {
      if (user) {
        const settings = await api.saveProviderSettings({
          baseUrl: values.baseUrl.trim(),
          model: values.model.trim(),
          apiKey: values.apiKey.trim(),
        });
        message.success("保存成功");
        onSaved(settings);
      } else {
        const raw = values.apiKey.trim();
        const hint =
          raw.length <= 8
            ? "•".repeat(raw.length)
            : `${raw.slice(0, 4)}${"•".repeat(4)}${raw.slice(-4)}`;
        message.success("配置已应用（本次会话有效）");
        onSaved({
          baseUrl: values.baseUrl.trim(),
          model: values.model.trim(),
          apiKeyHint: hint,
          hasApiKey: true,
          apiKey: raw,
        });
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const values = form.getFieldsValue();
    if (
      !values.baseUrl?.trim() ||
      !values.model?.trim() ||
      (!values.apiKey?.trim() && !savedSettings && !initialConfig.hasDefaultProvider)
    ) {
      message.warning("请先填写完整的连接信息");
      return;
    }
    setTesting(true);
    try {
      const input =
        values.apiKey?.trim() && values.baseUrl?.trim() && values.model?.trim()
          ? {
              apiKey: values.apiKey.trim(),
              baseUrl: values.baseUrl.trim(),
              model: values.model.trim(),
            }
          : undefined;
      const result: TestConnectionResult = await api.testProviderConnection(input);
      if (result.ok) {
        message.success(`连接成功${result.model ? ` · ${result.model}` : ""}`);
      } else {
        message.error(`连接失败：${result.error ?? "未知错误"}`);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  }

  async function handleClear() {
    if (!user) {
      onCleared();
      message.success("游客配置已清除");
      return;
    }
    try {
      await api.deleteProviderSettings();
      message.success("已清除服务端保存的配置");
      onCleared();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "清除失败");
    }
  }

  return (
    <Modal
      title="API 设置"
      open={open}
      onCancel={onClose}
      width={560}
      destroyOnHidden
      footer={null}
      styles={{ body: { paddingTop: 8 } }}
    >
      <p className="mb-4 text-sm text-neutral-500">
        {user
          ? "配置保存在你的账户下，API Key 加密存储。"
          : "游客配置仅本次会话有效，登录后可持久保存。"}{" "}
        留空使用服务端默认配置
        {initialConfig.hasDefaultProvider ? "（已配置）" : "（未配置，需填写）"}。
      </p>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          baseUrl:
            savedSettings?.baseUrl ??
            initialConfig.defaultBaseUrl ??
            "https://openrouter.ai/api/v1",
          model: savedSettings?.model ?? initialConfig.defaultModel ?? "openai/gpt-4o-mini",
          apiKey: "",
        }}
        autoComplete="off"
        onFinish={handleSave}
      >
        <Form.Item
          label="API 路径（Base URL）"
          name="baseUrl"
          rules={[{ required: true, message: "请填写 API 路径" }]}
        >
          <Input placeholder="https://openrouter.ai/api/v1" />
        </Form.Item>

        <Form.Item
          label={
            <span>
              API Key
              {isEditing && savedSettings?.apiKeyHint && (
                <Tooltip title="出于安全考虑，API Key 不回显，输入新 Key 将覆盖原值">
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    当前：{savedSettings.apiKeyHint}
                  </span>
                </Tooltip>
              )}
            </span>
          }
          name="apiKey"
          rules={[
            {
              required: true,
              message: isEditing ? "请重新输入 API Key（出于安全不回显原值）" : "请填写 API Key",
            },
          ]}
        >
          <Input.Password placeholder={isEditing ? "输入新 Key 以覆盖原值" : "sk-or-..."} />
        </Form.Item>

        <Form.Item
          label="模型 ID"
          name="model"
          rules={[{ required: true, message: "请填写模型 ID" }]}
        >
          <Input placeholder="openai/gpt-4o-mini" />
        </Form.Item>

        <Button block onClick={handleTest} loading={testing} style={{ marginBottom: 16 }}>
          测试连接
        </Button>

        <Divider style={{ margin: "8px 0 16px 0" }} />

        <div style={{ display: "flex", gap: 8 }}>
          <Button type="primary" htmlType="submit" loading={saving} style={{ flex: 1 }}>
            保存
          </Button>
          {(savedSettings || !user) && (
            <Button onClick={handleClear} danger>
              清除
            </Button>
          )}
          <Button onClick={onClose}>取消</Button>
        </div>
      </Form>
    </Modal>
  );
}
