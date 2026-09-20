import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/app-origin";
import { formatDate } from "@/lib/format";
import { formatResendFrom, isResendConfigured, sendResendEmail } from "@/lib/resend-mail";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import {
  parseDueTaskReminder,
  taskIsOverdue,
  taskReminderHtml,
  taskReminderSubject,
  taskReminderText,
} from "@/lib/task-desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

async function staffAuthorized() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request) && !(await staffAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("due_task_reminders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deskUrl = `${await appOrigin()}/tasks`;
  const rows = Array.isArray(data) ? data : [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const raw of rows) {
    const reminder = parseDueTaskReminder(raw);
    if (!reminder) {
      skipped += 1;
      continue;
    }
    const overdue = taskIsOverdue({ completed: false, dueAt: reminder.dueAt });
    const payload = {
      title: reminder.title,
      dueLabel: formatDate(reminder.dueAt),
      notes: reminder.notes,
      assigneeName: reminder.assigneeName,
      companyName: reminder.companyName,
      overdue,
      deskUrl,
    };
    const result = await sendResendEmail({
      to: reminder.assigneeEmail,
      subject: taskReminderSubject(reminder.title, overdue),
      text: taskReminderText(payload),
      html: taskReminderHtml(payload),
      from: formatResendFrom({
        senderName: "Office",
        companyName: reminder.companyName || "Truss",
      }),
      replyTo: reminder.companyEmail,
    });
    if (!result.ok) {
      failed += 1;
      continue;
    }
    const marked = await supabase.rpc("mark_task_reminded", { p_task_id: reminder.taskId });
    if (marked.error) {
      failed += 1;
      continue;
    }
    sent += 1;
  }

  return NextResponse.json({
    ok: true,
    configured: isResendConfigured(),
    due: rows.length,
    sent,
    failed,
    skipped,
  });
}
