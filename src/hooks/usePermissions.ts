import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";

export function usePermissions() {
  const { company, userPermissions } = useCompany();
  const { user } = useAuth();
  const isOwner = company?.owner_id === user?.id;

  function can(perm: string): boolean {
    if (isOwner) return true;
    if (userPermissions.includes("admin")) return true;
    return userPermissions.includes(perm);
  }

  function canAny(...perms: string[]): boolean {
    return perms.some(p => can(p));
  }

  return { can, canAny, isOwner, permissions: userPermissions };
}
