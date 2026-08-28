"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Table,
  Button,
  Space,
  Input,
  Tag,
  Modal,
  Form,
  Select,
  App as AntdApp,
  Tooltip,
  Popconfirm,
  Typography,
  DatePicker,
  InputNumber,
  Badge,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  HourglassOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { api, type AdminCustomerRow, type CustomerStatusType } from "@/lib/api";

const { Title } = Typography;

const STATUS_OPTIONS: { value: CustomerStatusType; label: string; color: string }[] = [
  { value: "active", label: "正式", color: "green" },
  { value: "trial", label: "试用", color: "orange" },
  { value: "expired", label: "已过期", color: "default" },
  { value: "disabled", label: "已禁用", color: "red" },
];

function statusTag(s: CustomerStatusType) {
  const o = STATUS_OPTIONS.find((x) => x.value === s);
  const text = o?.label ?? s;
  const color = o?.color ?? "default";
  // Badge 语义色，让"在有效期"显示更直观
  if (s === "active") return <Badge status="success" text={text} />;
  if (s === "trial") return <Badge status="processing" text={text} />;
  if (s === "expired") return <Badge status="warning" text={text} />;
  return <Badge status="error" text={text} />;
}

function renderExpire(row: AdminCustomerRow) {
  if (!row.expireAt) return <Tag color="purple">永久</Tag>;
  const d = dayjs(row.expireAt);
  const diffDays = d.diff(dayjs(), "day", true);
  let color: string = "default";
  let suffix = "";
  if (diffDays < 0) {
    color = "red";
    suffix = "（已过期）";
  } else if (diffDays <= 3) {
    color = "orange";
    suffix = `（剩 ${Math.ceil(diffDays)} 天）`;
  } else if (diffDays <= 30) {
    color = "gold";
    suffix = `（剩 ${Math.ceil(diffDays)} 天）`;
  } else {
    color = "green";
    suffix = `（剩 ${Math.floor(diffDays)} 天）`;
  }
  return (
    <div>
      <div>{d.format("YYYY-MM-DD HH:mm")}</div>
      <div>
        <Tag color={color} style={{ marginTop: 4 }}>
          {suffix || "有效"}
        </Tag>
      </div>
    </div>
  );
}

export default function AdminCustomersPage() {
  const { message } = AntdApp.useApp();
  const [list, setList] = useState<AdminCustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatusType | undefined>();
  const [pagination, setPagination] = useState<TablePaginationConfig>({ current: 1, pageSize: 20 });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [curRow, setCurRow] = useState<AdminCustomerRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [extendForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminListCustomers({
        page: pagination.current,
        pageSize: pagination.pageSize,
        keyword: keyword.trim() || undefined,
        status: statusFilter,
      });
      setList(data.list);
      setTotal(data.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载客户列表失败");
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, keyword, statusFilter, message]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- 创建 ----------
  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const v = await createForm.validateFields();
      const payload: Record<string, unknown> = {
        name: v.name.trim(),
        email: v.email?.trim(),
        phone: v.phone?.trim(),
        remark: v.remark?.trim(),
        status: v.status,
        linkedUserId: v.linkedUserId || null,
      };
      if (v.expireMode === "date" && v.expireAt) {
        payload.expireAt = (v.expireAt as Dayjs).toISOString();
      } else if (v.expireMode === "trial" && v.trialDays) {
        payload.trialDays = v.trialDays;
      }
      await api.adminCreateCustomer(payload as Parameters<typeof api.adminCreateCustomer>[0]);
      message.success("客户创建成功");
      setCreateOpen(false);
      createForm.resetFields();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as object)) return;
      message.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 编辑 ----------
  const openEdit = (row: AdminCustomerRow) => {
    setCurRow(row);
    editForm.setFieldsValue({
      name: row.name,
      email: row.email,
      phone: row.phone,
      remark: row.remark,
      status: row.status,
      expireAt: row.expireAt ? dayjs(row.expireAt) : null,
      linkedUserId: row.linkedUserId ?? undefined,
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!curRow) return;
    setSubmitting(true);
    try {
      const v = await editForm.validateFields();
      const patch: Record<string, unknown> = {
        name: v.name.trim(),
        email: v.email?.trim() || null,
        phone: v.phone?.trim() || null,
        remark: v.remark?.trim() || null,
        status: v.status,
        linkedUserId: v.linkedUserId || null,
      };
      if (v.expireAt) {
        patch.expireAt = (v.expireAt as Dayjs).toISOString();
      } else if (editForm.isFieldTouched("expireAt")) {
        // 用户显式清空了
        patch.expireAt = null;
      }
      await api.adminUpdateCustomer(curRow.id, patch);
      message.success("更新成功");
      setEditOpen(false);
      setCurRow(null);
      editForm.resetFields();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as object)) return;
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 延期 / 试用 ----------
  const openExtend = (row: AdminCustomerRow) => {
    setCurRow(row);
    extendForm.resetFields();
    extendForm.setFieldsValue({
      mode: "extend",
      days: 7,
    });
    setExtendOpen(true);
  };

  const handleExtend = async () => {
    if (!curRow) return;
    setSubmitting(true);
    try {
      const v = await extendForm.validateFields();
      if (v.mode === "extend") {
        await api.adminUpdateCustomer(curRow.id, { extendDays: Number(v.days) });
        message.success(`已延期 ${v.days} 天`);
      } else if (v.mode === "trial") {
        await api.adminUpdateCustomer(curRow.id, { trialDays: Number(v.days) });
        message.success(`已设置 ${v.days} 天试用`);
      } else if (v.mode === "date" && v.date) {
        await api.adminUpdateCustomer(curRow.id, {
          expireAt: (v.date as Dayjs).toISOString(),
        });
        message.success("到期日已更新");
      }
      setExtendOpen(false);
      setCurRow(null);
      extendForm.resetFields();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as object)) return;
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 删除 ----------
  const handleDelete = async (row: AdminCustomerRow) => {
    try {
      await api.adminDeleteCustomer(row.id);
      message.success("已删除客户：" + row.name);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  // ---------- 快速禁用 ----------
  const quickStatus = async (row: AdminCustomerRow, status: CustomerStatusType, tip: string) => {
    try {
      await api.adminUpdateCustomer(row.id, { status });
      message.success(tip);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const columns: ColumnsType<AdminCustomerRow> = [
    {
      title: "客户名称",
      dataIndex: "name",
      key: "name",
      render: (v, row) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{v}</span>
          {row.linkedUserId && (
            <span style={{ fontSize: 12, color: "#8c8c8c" }}>
              已绑定用户 ID：{row.linkedUserId}
            </span>
          )}
        </Space>
      ),
    },
    { title: "邮箱", dataIndex: "email", key: "email", render: (v) => v || "-" },
    { title: "电话", dataIndex: "phone", key: "phone", render: (v) => v || "-" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (v: CustomerStatusType) => statusTag(v),
    },
    {
      title: "到期时间",
      dataIndex: "expireAt",
      key: "expireAt",
      width: 220,
      render: (_, row) => renderExpire(row),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
      render: (v) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 280,
      render: (_, row) => (
        <Space wrap size={2}>
          <Tooltip title="编辑基础信息">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              编辑
            </Button>
          </Tooltip>
          <Tooltip title="试用 / 延期 / 设置到期日">
            <Button
              type="link"
              size="small"
              icon={<ClockCircleOutlined />}
              onClick={() => openExtend(row)}
            >
              延期
            </Button>
          </Tooltip>
          {row.status !== "disabled" && (
            <Tooltip title="立即禁用该客户，到期后无法再使用">
              <Button
                type="link"
                size="small"
                danger
                onClick={() => quickStatus(row, "disabled", "已禁用该客户")}
              >
                禁用
              </Button>
            </Tooltip>
          )}
          {row.status === "disabled" && (
            <Tooltip title="恢复为正式状态">
              <Button
                type="link"
                size="small"
                onClick={() => quickStatus(row, "active", "已恢复为正式客户")}
              >
                恢复
              </Button>
            </Tooltip>
          )}
          <Popconfirm
            title={`确认删除客户「${row.name}」？`}
            description="删除不可恢复。"
            onConfirm={() => handleDelete(row)}
            okText="删除"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        客户管理
      </Title>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Space wrap>
          <Space.Compact>
            <Input
              allowClear
              placeholder="搜索客户名 / 邮箱 / 电话"
              prefix={<SearchOutlined />}
              value={keyword}
              style={{ width: 260 }}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={() => setPagination((p) => ({ ...p, current: 1 }))}
            />
            <Button
              icon={<SearchOutlined />}
              onClick={() => setPagination((p) => ({ ...p, current: 1 }))}
            >
              搜索
            </Button>
          </Space.Compact>
          <Select
            allowClear
            placeholder="按状态筛选"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, current: 1 }));
            }}
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
        </Space>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              createForm.setFieldsValue({
                status: "trial",
                expireMode: "trial",
                trialDays: 7,
              });
              setCreateOpen(true);
            }}
          >
            新增客户
          </Button>
        </Space>
      </div>

      <Table<AdminCustomerRow>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (cur, size) => setPagination({ current: cur, pageSize: size }),
        }}
      />

      {/* 新增 */}
      <Modal
        title="新增客户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
        onOk={() => createForm.submit()}
        confirmLoading={submitting}
        width={560}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="客户名称"
            rules={[{ required: true, message: "请输入客户名称" }]}
          >
            <Input placeholder="公司名称 / 个人姓名" />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Form.Item name="email" label="邮箱">
              <Input placeholder="联系人邮箱" />
            </Form.Item>
            <Form.Item name="phone" label="电话">
              <Input placeholder="联系人电话" />
            </Form.Item>
          </div>
          <Form.Item
            name="status"
            label="初始状态"
            rules={[{ required: true, message: "请选择初始状态" }]}
            initialValue="trial"
          >
            <Select
              options={STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="expireMode"
            label="有效期设置"
            initialValue="trial"
            rules={[{ required: true, message: "请选择有效期设置方式" }]}
          >
            <Select
              options={[
                { value: "trial", label: `直接给 N 天试用（自动设为试用状态）` },
                { value: "date", label: `指定具体到期日` },
                { value: "never", label: `永久（不设到期日）` },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, n) => p.expireMode !== n.expireMode}>
            {({ getFieldValue }) => {
              const m = getFieldValue("expireMode");
              if (m === "trial") {
                return (
                  <Form.Item
                    name="trialDays"
                    label={
                      <span>
                        <HourglassOutlined /> 试用天数
                      </span>
                    }
                    rules={[{ required: true, message: "请输入天数" }]}
                    initialValue={7}
                  >
                    <InputNumber min={1} max={365} style={{ width: 200 }} addonAfter="天" />
                  </Form.Item>
                );
              }
              if (m === "date") {
                return (
                  <Form.Item
                    name="expireAt"
                    label={
                      <span>
                        <CalendarOutlined /> 到期日期
                      </span>
                    }
                    rules={[{ required: true, message: "请选择到期日期" }]}
                  >
                    <DatePicker showTime style={{ width: "100%" }} placeholder="选择到期时间" />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item name="linkedUserId" label="关联系统用户 ID（可选）">
            <Input placeholder="用户 ID（非必填）" />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="合同信息 / 对接人等说明" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑 */}
      <Modal
        title="编辑客户信息"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        destroyOnHidden
        onOk={() => editForm.submit()}
        confirmLoading={submitting}
        width={560}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item
            name="name"
            label="客户名称"
            rules={[{ required: true, message: "请输入客户名称" }]}
          >
            <Input />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Form.Item name="email" label="邮箱">
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="电话">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select
              options={STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="expireAt"
            label={
              <span>
                <CalendarOutlined /> 到期日（清空设为永久）
              </span>
            }
          >
            <DatePicker showTime style={{ width: "100%" }} allowClear />
          </Form.Item>
          <Form.Item name="linkedUserId" label="关联系统用户 ID">
            <Input allowClear placeholder="可清空" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 延期/试用操作 */}
      <Modal
        title={curRow ? `「${curRow.name}」 延期 / 试用` : "延期 / 试用"}
        open={extendOpen}
        onCancel={() => setExtendOpen(false)}
        destroyOnHidden
        onOk={() => extendForm.submit()}
        confirmLoading={submitting}
      >
        <Form form={extendForm} layout="vertical" onFinish={handleExtend}>
          <Form.Item
            name="mode"
            label="操作方式"
            rules={[{ required: true, message: "请选择操作方式" }]}
          >
            <Select
              options={[
                { value: "extend", label: "在当前到期日基础上追加 N 天" },
                { value: "trial", label: "重置为 N 天试用（也可用于正式客户续期试用版）" },
                { value: "date", label: "直接设置新的到期日" },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, n) => p.mode !== n.mode}>
            {({ getFieldValue }) => {
              const m = getFieldValue("mode");
              if (m === "extend" || m === "trial") {
                return (
                  <Form.Item
                    name="days"
                    label="天数"
                    rules={[{ required: true, message: "请输入天数" }]}
                    initialValue={7}
                  >
                    <InputNumber min={1} max={3650} style={{ width: 200 }} addonAfter="天" />
                  </Form.Item>
                );
              }
              if (m === "date") {
                return (
                  <Form.Item
                    name="date"
                    label={
                      <span>
                        <CalendarOutlined /> 新到期日期
                      </span>
                    }
                    rules={[{ required: true, message: "请选择日期" }]}
                  >
                    <DatePicker showTime style={{ width: "100%" }} />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
