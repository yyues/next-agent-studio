/**
 * Resources 目录管理
 *
 * 职责：管理 resources/{roleId}/ 目录的创建和删除。
 * RAG 资料 zip 包解压到此目录，供后续检索使用。
 */
import { existsSync, mkdirSync, rmSync } from "fs";
import { join, resolve } from "path";

const RESOURCES_ROOT = resolve(process.cwd(), "resources");

export function getRoleResourceDir(roleId: string): string {
  return join(RESOURCES_ROOT, roleId);
}

export function ensureRoleResourceDir(roleId: string): string {
  const dir = join(RESOURCES_ROOT, roleId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function removeRoleResourceDir(roleId: string): void {
  const dir = join(RESOURCES_ROOT, roleId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
