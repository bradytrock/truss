#!/usr/bin/env python3
"""Concatenate supabase/migrations into a re-runnable bootstrap.sql."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
OUT = ROOT / "supabase" / "bootstrap.sql"

TYPE_RE = re.compile(
    r"(?P<stmt>create type\s+public\.\w+\s+as enum\s*\(.*?\);)",
    re.IGNORECASE | re.DOTALL,
)
TABLE_RE = re.compile(r"create table (?!if not exists )", re.IGNORECASE)
UNIQUE_INDEX_RE = re.compile(r"create unique index (?!if not exists )", re.IGNORECASE)
INDEX_RE = re.compile(r"create index (?!if not exists )", re.IGNORECASE)
POLICY_RE = re.compile(
    r'^(?P<indent>[ \t]*)create policy\s+"(?P<name>[^"]+)"\s+on\s+(?P<table>[\w.]+)',
    re.IGNORECASE | re.MULTILINE,
)
TRIGGER_RE = re.compile(
    r"create trigger\s+(\w+)\s+after insert on\s+([\w.]+)",
    re.IGNORECASE,
)


def wrap_create_type(sql: str) -> str:
    def repl(match: re.Match[str]) -> str:
        stmt = match.group("stmt").rstrip()
        start = match.start()
        prefix = sql[max(0, start - 40) : start].lower()
        if "do $$ begin" in prefix or "do $$begin" in prefix.replace(" ", ""):
            return stmt
        return f"do $$ begin\n  {stmt}\nexception\n  when duplicate_object then null;\nend $$;"

    return TYPE_RE.sub(repl, sql)


def add_policy_drops(sql: str) -> str:
    lines = sql.splitlines(keepends=True)
    out: list[str] = []
    for line in lines:
        match = POLICY_RE.match(line)
        if match:
            drop = (
                f'{match.group("indent")}drop policy if exists '
                f'"{match.group("name")}" on {match.group("table")};\n'
            )
            prev = "".join(out[-3:]).lower()
            already = f'drop policy if exists "{match.group("name").lower()}" on {match.group("table").lower()}'
            if already not in prev:
                out.append(drop)
        out.append(line)
    return "".join(out)


def add_trigger_drops(sql: str) -> str:
    def repl(match: re.Match[str]) -> str:
        name, table = match.group(1), match.group(2)
        drop = f"drop trigger if exists {name} on {table};\n"
        start = match.start()
        prev = sql[max(0, start - 120) : start].lower()
        if f"drop trigger if exists {name.lower()}" in prev:
            return match.group(0)
        return drop + match.group(0)

    return TRIGGER_RE.sub(repl, sql)


def transform(sql: str) -> str:
    sql = wrap_create_type(sql)
    sql = TABLE_RE.sub("create table if not exists ", sql)
    sql = UNIQUE_INDEX_RE.sub("create unique index if not exists ", sql)
    sql = INDEX_RE.sub("create index if not exists ", sql)
    sql = add_policy_drops(sql)
    sql = add_trigger_drops(sql)
    return sql


def main() -> None:
    parts = [
        "-- Truss schema bootstrap. Paste this entire file into the Supabase SQL editor and run once.\n"
        "-- Safe to re-run if objects already exist. Individual files remain in supabase/migrations/.\n"
    ]
    for path in sorted(MIGRATIONS.glob("*.sql")):
        body = path.read_text()
        parts.append(f"\n-- ========== {path.name} ==========\n")
        parts.append(transform(body).rstrip() + "\n")
    OUT.write_text("".join(parts))
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
