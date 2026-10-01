export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="h-8 w-48 animate-pulse bg-muted" />
      <div className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse border bg-muted" />
    </div>
  );
}
