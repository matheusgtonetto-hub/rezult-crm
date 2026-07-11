import { useCRM } from "@/context/CRMContext";
import { useProfile } from "@/context/ProfileContext";
import { usePermissions } from "./usePermissions";
import type { AttendantPermissions } from "@/data/mockData";

export function usePipelinePermissions() {
  const { pipelines } = useCRM();
  const { profile } = useProfile();
  const { isOwner, can } = usePermissions();
  const myName = profile?.full_name ?? "";
  const isAdmin = isOwner || can("admin");

  const getPerms = (pipelineId: string): AttendantPermissions => {
    if (isAdmin) return {};
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return {};
    return pipeline.permissions?.byAttendant?.[myName] ?? {};
  };

  const isBlocked = (pipelineId: string) =>
    !isAdmin && (getPerms(pipelineId).blockViewPipeline ?? false);

  return { getPerms, isBlocked, isAdmin, myName };
}
