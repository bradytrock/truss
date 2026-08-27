export function DocumentNotesBlock({ notes }: { notes?: string | null }) {
  const text = notes?.trim() ?? "";
  if (!text) return null;
  return (
    <div className="break-inside-auto">
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">Notes</h3>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}
