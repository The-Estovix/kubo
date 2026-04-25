import { cn } from "@/lib/utils";

export type TaskStatus = "UNASSIGNED" | "NOT_STARTED" | "ACTIVE" | "COMPLETED";

const labels: Record<TaskStatus, string> = {
  UNASSIGNED: "Unassigned",
  NOT_STARTED: "Not started",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};

const styles: Record<TaskStatus, string> = {
  UNASSIGNED: "bg-muted text-muted-foreground",
  NOT_STARTED: "bg-[color:var(--status-not-started)]/10 text-[color:var(--status-not-started)]",
  ACTIVE: "bg-[color:var(--status-active)]/10 text-[color:var(--status-active)]",
  COMPLETED: "bg-[color:var(--status-completed)]/10 text-[color:var(--status-completed)]",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        styles[status],
        className,
      )}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status]}
    </span>
  );
}
