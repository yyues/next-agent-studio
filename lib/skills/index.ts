import type { SkillModule } from "./types";

const skillLoaders: Record<string, () => Promise<{ default: SkillModule }>> = {
  base: () => import("./modules/base"),
  developer: () => import("./modules/developer"),
  analyst: () => import("./modules/analyst"),
};

export const availableSkillIds = Object.keys(skillLoaders);

export async function loadSkillsByIds(skillIds: string[]) {
  const uniqueIds = Array.from(new Set(skillIds));
  const loaded = await Promise.all(
    uniqueIds
      .filter((id) => id in skillLoaders)
      .map(async (id) => (await skillLoaders[id]()).default),
  );

  return loaded;
}
