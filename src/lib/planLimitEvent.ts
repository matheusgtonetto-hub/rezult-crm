export function emitPlanLimit(resource: string) {
  window.dispatchEvent(new CustomEvent("plan-limit-reached", { detail: { resource } }));
}
