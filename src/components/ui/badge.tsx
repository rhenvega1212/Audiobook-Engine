import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-warm-sand text-ink",
        cast: "bg-success/10 text-success",
        needsVoice: "bg-warning/10 text-warning",
        newChar: "bg-teal/10 text-teal",
        alias: "bg-sage/15 text-slate",
        aiReviewed: "bg-ai-reviewed/10 text-ai-reviewed",
        uploaded: "bg-slate/10 text-slate",
        reviewing: "bg-warning/10 text-warning",
        ready: "bg-success/10 text-success",
        lead: "bg-burgundy/10 text-burgundy",
        main: "bg-burgundy/10 text-dark-red",
        side: "bg-teal/10 text-teal",
        guest: "bg-slate/10 text-slate",
        narrator: "bg-warm-sand text-slate",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
