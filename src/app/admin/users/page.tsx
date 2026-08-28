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
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import { api, type AdminUserRow } from "@/lib/api";

const { Title } = Typography;

export default function AdminUsersPage() {
  const { message, modal } = AntdApp.useApp();
  const [list, setList] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [pagination, setPagination] = useState<TablePaginationConfig>({ current: 1, pageSize: 20 });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [curUser, setCurUser] = useState<AdminUserRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminListUsers({
        page: pagination.current,
        pageSize: pagination.pageSize,
        keyword: keyword.trim() || undefined,
      });
      setList(data.list);
      setTotal(data.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, keyword, message]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- 创建 ----------
  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const values = await createForm.validateFields();
      await api.adminCreateUser({
        email: values.email.trim(),
        password: values.password,
        name: values.name?.trim(),
        role: values.role,
      });
      message.success("用户创建成功");
      setCreateOpen(false);
      createForm.resetFields();
      await load();
    } catch (e) {
      // 校验错误不提示
      if (e && typeof e === "object" && "errorFields" in (e as object)) return;
      message.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 编辑姓名/角色 ----------
  const openEdit = (row: AdminUserRow) => {
    setCurUser(row);
    editForm.setFieldsValue({ name: row.name, role: row.role });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!curUser) return;
    setSubmitting(true);
    try {
      const values = await editForm.validateFields();
      await api.adminUpdateUser(curUser.id, {
        name: values.name?.trim(),
        role: values.role,
      });
      message.success("更新成功");
      setEditOpen(false);
      setCurUser(null);
      editForm.resetFields();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as object)) return;
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 重置密码 ----------
  const openResetPwd = (row: AdminUserRow) => {
    setCurUser(row);
    pwdForm.resetFields();
    setPwdOpen(true);
  };

  const handleResetPwd = async () => {
    if (!curUser) return;
    setSubmitting(true);
    try {
      const values = await pwdForm.validateFields();
      await api.adminUpdateUser(curUser.id, { password: values.password });
      message.success("密码已重置");
      setPwdOpen(false);
      setCurUser(null);
      pwdForm.resetFields();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as object)) return;
      message.error(e instanceof Error ? e.message : "重置失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 删除 ----------
  const handleDelete = async (row: AdminUserRow) => {
    try {
      await api.adminDeleteUser(row.id);
      message.success("已删除用户：" + row.name);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const columns: ColumnsType<AdminUserRow> = [
    {
      title: "姓名",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      width: 120,
      render: (r: AdminUserRow["role"]) =>
        r === "admin" ? <Tag color="red">管理员</Tag> : <Tag color="blue">普通用户</Tag>,
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 200,
      render: (v: string | Date) => (v ? new Date(v).toLocaleString() : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 260,
      render: (_, row) => (
        <Space>
          <Tooltip title="编辑信息/角色">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              编辑
            </Button>
          </Tooltip>
          <Tooltip title="重置密码">
            <Button
              type="link"
              size="small"
              icon={<KeyOutlined />}
              onClick={() => openResetPwd(row)}
            >
              改密码
            </Button>
          </Tooltip>
          <Popconfirm
            title={`确认删除用户「${row.name}」？`}
            description="该用户的会话、消息、Provider 配置会一并删除，不可恢复。"
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
        用户管理
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
        <Space.Compact>
          <Input
            allowClear
            placeholder="搜索姓名 / 邮箱"
            prefix={<SearchOutlined />}
            value={keyword}
            style={{ width: 260 }}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => {
              setPagination((p) => ({ ...p, current: 1 }));
            }}
          />
          <Button
            icon={<SearchOutlined />}
            onClick={() => setPagination((p) => ({ ...p, current: 1 }))}
          >
            搜索
          </Button>
        </Space.Compact>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              setCreateOpen(true);
            }}
          >
            新建用户
          </Button>
        </Space>
      </div>

      <Table<AdminUserRow>
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

      {/* 新建 */}
      <Modal
        title="新建用户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
        onOk={() => createForm.submit()}
        confirmLoading={submitting}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "邮箱格式不正确" },
            ]}
          >
            <Input placeholder="example@domain.com" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input placeholder="用户姓名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: "请输入初始密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password placeholder="至少 6 位，用户首次登录后可自行修改" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: "请选择角色" }]}
            initialValue="user"
          >
            <Select
              options={[
                { value: "user", label: "普通用户" },
                { value: "admin", label: "管理员" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑 */}
      <Modal
        title="编辑用户信息"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        destroyOnHidden
        onOk={() => editForm.submit()}
        confirmLoading={submitting}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
            <Select
              options={[
                { value: "user", label: "普通用户" },
                { value: "admin", label: "管理员" },
              ]}
            />
          </Form.Item>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            邮箱：{curUser?.email}
            <br />
            提示：系统至少需要保留一个管理员。
          </div>
        </Form>
      </Modal>

      {/* 重置密码 */}
      <Modal
        title="重置密码"
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        destroyOnHidden
        onOk={() => pwdForm.submit()}
        confirmLoading={submitting}
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleResetPwd}>
          <Form.Item label="目标用户">
            <Input value={curUser ? `${curUser.name} <${curUser.email}>` : ""} disabled />
          </Form.Item>
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="再次输入"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请再次输入密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject(new Error("两次输入的密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
