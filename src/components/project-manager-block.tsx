import { formatPhone } from "@/lib/format";
import type { ProjectManagerContact } from "@/lib/document-owner";

export function ProjectManagerBlock({
  manager,
}: {
  manager: ProjectManagerContact | null | undefined;
}) {
  const name = manager?.name.trim() ?? "";
  if (!name) return null;
  const title = manager?.title.trim() ?? "";
  const email = manager?.email.trim() ?? "";
  const phone = formatPhone(manager?.phone);
  const phoneLine = phone && phone !== "—" ? phone : "";

  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">Project manager</h3>
      <p className="text-sm font-medium">Project manager name: {name}</p>
      {title ? <p className="mt-0.5 text-sm text-muted-foreground">{title}</p> : null}
      {phoneLine ? <p className="text-sm text-muted-foreground">{phoneLine}</p> : null}
      {email ? (
        <p className="text-sm text-muted-foreground">
          <a href={`mailto:${email}`} className="hover:underline">
            {email}
          </a>
        </p>
      ) : null}
    </div>
  );
}
