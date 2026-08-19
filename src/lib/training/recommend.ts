import type { ProjectType } from "@/lib/types";

const BY_TYPE: Record<ProjectType, string[]> = {
  roofing: ["measuring", "asphalt", "repair", "estimating"],
  restoration: ["repair", "underlayment", "insulation", "estimating"],
  exterior: ["measuring", "metal", "wood", "asphalt"],
  addition: ["sheathing", "underlayment", "estimating"],
  remodel: ["repair", "insulation", "estimating"],
  commercial: ["lowslope", "singleply", "estimating"],
  multifamily: ["asphalt", "lowslope", "estimating"],
  healthcare: ["lowslope", "singleply", "estimating"],
  education: ["lowslope", "metal", "estimating"],
  industrial: ["metal", "lowslope", "singleply"],
  hospitality: ["tile", "metal", "estimating"],
  civic: ["lowslope", "slate", "estimating"],
  tenant_improvement: ["lowslope", "singleply", "estimating"],
};

export function recommendedChapterIds(projectType: ProjectType | null | undefined) {
  if (!projectType) return ["measuring", "asphalt", "estimating"];
  return BY_TYPE[projectType] ?? ["measuring", "estimating"];
}
