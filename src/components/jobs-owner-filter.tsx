"use client";

import { ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SEAT_ROLE_LABELS, type StaffMember } from "@/lib/types";
import {
  JOBS_UNASSIGNED_OWNER,
  jobsOwnerFilterIds,
  jobsOwnerFilterLabel,
  toggleJobsOwnerFilter,
} from "@/lib/visibility";

export function JobsOwnerFilter({
  people,
  selectedIds,
  onChange,
}: {
  people: StaffMember[];
  selectedIds: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
}) {
  const allowedIds = jobsOwnerFilterIds(people);
  const checked = selectedIds ?? new Set(allowedIds);
  const label = jobsOwnerFilterLabel(selectedIds, people);
  const allSelected = selectedIds === null;
  const noneSelected = selectedIds !== null && selectedIds.size === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between sm:w-auto sm:max-w-64"
            aria-label={`Show jobs for ${label}`}
          />
        }
      >
        <Users />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>Whose jobs</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={allSelected}
          onClick={() => onChange(null)}
        >
          Select all
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={noneSelected}
          onClick={() => onChange(new Set())}
        >
          Clear
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={checked.has(JOBS_UNASSIGNED_OWNER)}
          closeOnClick={false}
          onCheckedChange={() =>
            onChange(toggleJobsOwnerFilter(JOBS_UNASSIGNED_OWNER, selectedIds, allowedIds))
          }
        >
          Unassigned
        </DropdownMenuCheckboxItem>
        {people.map((member) => (
          <DropdownMenuCheckboxItem
            key={member.id}
            checked={checked.has(member.id)}
            closeOnClick={false}
            onCheckedChange={() =>
              onChange(toggleJobsOwnerFilter(member.id, selectedIds, allowedIds))
            }
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{member.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {SEAT_ROLE_LABELS[member.role]}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
