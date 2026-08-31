/**
 * Resources 目录管理
 *
 * 生产环境（Vercel）文件系统只读，RAG 资料文件改存 Vercel Blob。
 * 元数据存 MongoDB（RoleResource），文件存 Blob，路径前缀 resources/{roleId}/{resourceId}/
 */
import { connectToMongo } from "@/lib/mongodb";
import { RoleResourceModel } from "@/lib/models/role-resource";
import { blobListPathnames, blobDel } from "@/lib/blob";
import { deleteResourceChunks } from "@/lib/rag";

/**
 * 删除角色的所有上传 resource：清理 Vercel Blob + MongoDB 记录 + RAG 切片。
 */
export async function removeRoleResourceDir(roleId: string): Promise<void> {
  try {
    await connectToMongo();
    await RoleResourceModel.deleteMany({ roleId });
  } catch {
    // 数据库清理失败不阻断
  }
  try {
    const pathnames = await blobListPathnames(`resources/${roleId}/`);
    if (pathnames.length > 0) await blobDel(pathnames);
  } catch {
    // Blob 清理失败不阻断
  }
  try {
    await deleteResourceChunks(roleId);
  } catch {
    // 切片清理失败不阻断
  }
}
