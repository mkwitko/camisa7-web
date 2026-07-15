import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { HTMLAttributes } from "react";

type Variant = "danger" | "success";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
};

const ICONS: Record<Variant, typeof AlertTriangle> = {
  danger: AlertTriangle,
  success: CheckCircle2,
};

const STYLES: Record<Variant, string> = {
  danger: "border-danger/40 bg-danger/10 text-danger",
  success: "border-primary/40 bg-primary/10 text-primary",
};

/** Small inline banner for form/API feedback — this app has no toast system. */
export function InlineMessage({ variant = "danger", className, children, ...props }: Props) {
  const Icon = ICONS[variant];
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border px-4 py-3 text-sm",
        STYLES[variant],
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
