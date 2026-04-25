export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return "No deadline";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function deadlineTone(iso: string | null | undefined): "overdue" | "soon" | "ok" | "none" {
  const d = daysUntil(iso);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 3) return "soon";
  return "ok";
}

export function deadlineLabel(iso: string | null | undefined): string {
  const d = daysUntil(iso);
  if (d === null) return "";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `${d}d left`;
}
