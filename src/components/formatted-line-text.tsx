import { lineTextToSafeHtml } from "@/lib/line-format";
import { cn } from "@/lib/utils";

export function FormattedLineText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const html = lineTextToSafeHtml(text);
  if (!html) return null;
  return (
    <div
      className={cn("formatted-line-text", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
