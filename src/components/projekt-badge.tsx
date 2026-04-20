interface ProjektBadgeProps {
  name: string;
  farbe: string;
  size?: "sm" | "md";
}

export function ProjektBadge({ name, farbe, size = "sm" }: ProjektBadgeProps) {
  const dotSize = size === "md" ? "w-3 h-3" : "w-2 h-2";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <span className={`inline-flex items-center gap-1.5 ${textSize} text-foreground`}>
      <span className={`${dotSize} rounded-full shrink-0`} style={{ background: farbe }} />
      {name}
    </span>
  );
}
