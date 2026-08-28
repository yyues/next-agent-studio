/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Typography, Spin, Tag } from "antd";
import {
  UserOutlined,
  TeamOutlined,
  WechatOutlined,
  MessageOutlined,
  ArrowUpOutlined,
  UserAddOutlined,
  StarOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import { api, type AdminStats } from "@/lib/api";

const { Title } = Typography;

function TrendSection({ data }: { data: AdminStats["trend"] }) {
  const max = Math.max(1, ...data.messages, ...data.conversations, ...data.users);
  const bar = (n: number) => `${(n / max) * 100}%`;
  return (
    <Card title="近 7 天趋势" size="small">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${data.days.length}, 1fr)`,
          gap: 12,
          alignItems: "flex-end",
          minHeight: 140,
          paddingTop: 8,
        }}
      >
        {data.days.map((d, i) => (
          <div
            key={d}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 2,
                alignItems: "flex-end",
                height: 100,
              }}
            >
              <div
                style={{
                  width: 8,
                  background: "#1677ff",
                  borderRadius: 4,
                  height: bar(data.messages[i]),
                }}
                title={`消息 ${data.messages[i]}`}
              />
              <div
                style={{
                  width: 8,
                  background: "#52c41a",
                  borderRadius: 4,
                  height: bar(data.conversations[i]),
                }}
                title={`会话 ${data.conversations[i]}`}
              />
              <div
                style={{
                  width: 8,
                  background: "#faad14",
                  borderRadius: 4,
                  height: bar(data.users[i]),
                }}
                title={`新用户 ${data.users[i]}`}
              />
            </div>
            <span style={{ fontSize: 12, color: "#8c8c8c" }}>{d}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginTop: 8,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: "#1677ff",
              borderRadius: 2,
            }}
          />{" "}
          消息
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: "#52c41a",
              borderRadius: 2,
            }}
          />{" "}
          会话
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: "#faad14",
              borderRadius: 2,
            }}
          />{" "}
          新用户
        </span>
      </div>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await api.adminStats();
      setStats(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        看板 Dashboard
      </Title>

      {loading ? (
        <div style={{ textAlign: "center", padding: "120px 0" }}>
          <Spin size="large" tip="加载中…" />
        </div>
      ) : err ? (
        <Card>
          <span style={{ color: "#ff4d4f" }}>{err}</span>
        </Card>
      ) : (
        stats && (
          <>
            <Title level={5} style={{ color: "#8c8c8c" }}>
              今日数据{" "}
              <Tag icon={<ArrowUpOutlined />} color="blue">
                Today
              </Tag>
            </Title>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={8}>
                <Card>
                  <Statistic
                    title="新增注册"
                    value={stats.today.users}
                    prefix={<UserAddOutlined />}
                    styles={{ content: { color: "#1677ff" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card>
                  <Statistic
                    title="新会话"
                    value={stats.today.conversations}
                    prefix={<WechatOutlined />}
                    styles={{ content: { color: "#52c41a" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card>
                  <Statistic
                    title="新增消息"
                    value={stats.today.messages}
                    prefix={<MessageOutlined />}
                    styles={{ content: { color: "#faad14" } }}
                  />
                </Card>
              </Col>
            </Row>

            <Title level={5} style={{ color: "#8c8c8c" }}>
              全局概览
            </Title>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="注册用户总数"
                    value={stats.overview.totalUsers}
                    prefix={<UserOutlined />}
                    suffix={
                      stats.overview.totalAdmins > 0 && (
                        <Tag color="red" style={{ marginLeft: 8 }}>
                          {stats.overview.totalAdmins} 管理员
                        </Tag>
                      )
                    }
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="会话总数"
                    value={stats.overview.totalConversations}
                    prefix={<WechatOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="消息总数"
                    value={stats.overview.totalMessages}
                    prefix={<MessageOutlined />}
                  />
                </Card>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="客户总数"
                    value={stats.overview.totalCustomers}
                    prefix={<TeamOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="有效客户"
                    value={stats.overview.activeCustomers}
                    prefix={<StarOutlined />}
                    styles={{ content: { color: "#52c41a" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="试用客户"
                    value={stats.overview.trialCustomers}
                    prefix={<ExperimentOutlined />}
                    styles={{ content: { color: "#fa8c16" } }}
                  />
                </Card>
              </Col>
            </Row>

            <TrendSection data={stats.trend} />
          </>
        )
      )}
    </div>
  );
}
