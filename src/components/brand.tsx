export function TrussMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className ?? "size-5"}
    >
      <path
        d="M2.8 19.2 12 4.8l9.2 14.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      <path d="M12 4.8v14.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.2 12.6h9.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function BrandMark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={className ?? "inline-flex items-center gap-2 text-foreground"}>
      <TrussMark className={markClassName ?? "size-[18px] text-primary"} />
      <span className="font-heading text-[1.15rem] leading-none font-medium tracking-tight">
        Truss
      </span>
    </span>
  );
}
