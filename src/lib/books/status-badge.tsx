import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BookStatus } from "@/lib/types/database";

export function BookStatusBadge({ status }: { status: BookStatus }) {
  switch (status) {
    case "uploaded":
    case "analyzing":
      return <Badge variant="uploaded">{status.replace("_", " ")}</Badge>;
    case "needs_casting":
    case "reviewing":
      return <Badge variant="reviewing">{status.replace("_", " ")}</Badge>;
    case "ready_for_review":
    case "ready_for_export":
    case "exported":
      return <Badge variant="ready">{status.replace("_", " ")}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export function CastStatusBadge({
  status,
  className,
}: {
  status: "cast" | "needs_voice" | "new" | "possible_alias";
  className?: string;
}) {
  const badgeClass = cn("whitespace-nowrap", className);
  switch (status) {
    case "cast":
      return (
        <Badge variant="cast" className={badgeClass}>
          Cast
        </Badge>
      );
    case "needs_voice":
      return (
        <Badge variant="needsVoice" className={badgeClass}>
          Needs voice
        </Badge>
      );
    case "new":
      return (
        <Badge variant="newChar" className={badgeClass}>
          New
        </Badge>
      );
    case "possible_alias":
      return (
        <Badge variant="alias" className={cn(badgeClass, "text-[10px]")}>
          Possible alias
        </Badge>
      );
  }
}
