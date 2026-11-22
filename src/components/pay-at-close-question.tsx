"use client";

import { CurrencyInput } from "@/components/currency-input";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InterviewQuestion, InterviewSource, InterviewValue } from "@/lib/pay-at-close";

/**
 * One interview question with its input, as the office sees it. Label on the left, control on
 * the right, with where the answer came from and anything the public record says about it.
 */
export function QuestionField({
  question,
  value,
  missing,
  source,
  note,
  onChange,
}: {
  question: InterviewQuestion;
  value: InterviewValue;
  missing: boolean;
  /** Who gave the current answer. Shown as a badge when it was the homeowner. */
  source?: InterviewSource;
  /** Public-record comparison or guidance, under the input. */
  note?: React.ReactNode;
  onChange: (value: InterviewValue) => void;
}) {
  const id = `interview-${question.id}`;
  return (
    <div className={cn("grid gap-2 border-b py-4 last:border-b-0 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6", missing ? "bg-rose-50/40 dark:bg-rose-950/20" : undefined)}>
      <label htmlFor={id} className="text-sm leading-snug font-medium">
        {question.prompt}
        {question.required ? <span className="ml-1 text-primary">*</span> : null}
      </label>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <QuestionInput id={id} question={question} value={value} onChange={onChange} />
          {source === "homeowner" ? (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">From homeowner</span>
          ) : null}
        </div>
        {note ? <div className="text-xs text-muted-foreground">{note}</div> : question.help ? <p className="text-xs text-muted-foreground">{question.help}</p> : null}
      </div>
    </div>
  );
}

export function QuestionInput({
  id,
  question,
  value,
  onChange,
}: {
  id: string;
  question: InterviewQuestion;
  value: InterviewValue;
  onChange: (value: InterviewValue) => void;
}) {
  switch (question.kind) {
    case "yes_no":
      return (
        <div className="inline-flex rounded-[10px] border p-0.5" role="radiogroup" aria-labelledby={id}>
          {[
            { label: "Yes", choice: true },
            { label: "No", choice: false },
          ].map((option) => (
            <Button
              key={option.label}
              type="button"
              role="radio"
              size="sm"
              aria-checked={value === option.choice}
              variant={value === option.choice ? "default" : "ghost"}
              className={value === option.choice ? "bg-foreground text-background hover:bg-foreground/90" : undefined}
              onClick={() => onChange(value === option.choice ? null : option.choice)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      );
    case "money":
      return (
        <CurrencyInput
          id={id}
          value={typeof value === "number" && value > 0 ? value : ""}
          className="sm:max-w-xs"
          onValueChange={(text) => {
            const amount = Number(text);
            onChange(text === "" || text === "." || !Number.isFinite(amount) ? null : amount);
          }}
        />
      );
    case "date":
      return <Input id={id} type="date" className="sm:max-w-xs" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
    case "select": {
      const current = typeof value === "string" ? value : "";
      return (
        <Select value={current} onValueChange={(next) => onChange(next || null)} items={(question.options ?? []).map((option) => ({ value: option.value, label: option.label }))}>
          <SelectTrigger id={id} className="w-full sm:max-w-sm">
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {(question.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "long_text":
      return <Textarea id={id} rows={3} className="w-full" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
    default:
      if (question.field === "escrowPhone") {
        return <PhoneInput id={id} value={typeof value === "string" ? value : ""} autoComplete="off" onValueChange={(next) => onChange(next || null)} />;
      }
      return <Input id={id} className="w-full" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  }
}
