import { Loader2 } from "lucide-react";

export default function CleanupLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate">
      <Loader2 className="h-8 w-8 animate-spin text-teal" />
      <p className="text-body-sm">Opening manuscript editor…</p>
    </div>
  );
}
