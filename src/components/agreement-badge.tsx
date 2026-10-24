import { agreementZone } from "@/lib/agreement";
import { cn } from "@/lib/utils";

export function AgreementBadge({ percent }: { percent: number }) {
  const zone = agreementZone(percent);
  return <span className={cn("inline-flex shrink-0 items-center gap-2 text-sm font-medium", zone === "green" ? "text-agreement-good" : zone === "yellow" ? "text-agreement-warn" : "text-destructive")}><span className={cn("size-2.5 rounded-full", zone === "green" ? "bg-agreement-good" : zone === "yellow" ? "bg-agreement-warn" : "bg-destructive")} />{percent}%</span>;
}