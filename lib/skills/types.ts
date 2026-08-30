/**
 * SkillModule — skill 的运行时表示
 *
 * 对话时由 loadSkillsByRoleId 加载，
 * 用于拼装 systemPrompt。
 */
export type SkillModule = {
  id: string;
  title: string;
  /** 可选：skill 描述，用于详情页展示 */
  description?: string;
  /** 核心指令，注入 systemPrompt */
  instructions: string;
  /** 可选：prompt 模板列表 */
  prompts?: string[];
  /** 可选：知识库文档内容 */
  knowledge?: string[];
  /** 版本号 */
  version?: string;
};
