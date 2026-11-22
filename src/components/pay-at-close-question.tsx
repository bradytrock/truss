"use client";

import { CurrencyInput } from "@/components/currency-input";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InterviewQuestion, InterviewValue } from "@/lib/pay-at-close";

/** One interview question with its input. Shared by the rep's interview dialog and the homeowner application. */
export function QuestionField({
  question,
  value,
  missing,
  onChange,
}: {
  question: InterviewQuestion;
  value: InterviewValue;
  missing: boolean;
  onChange: (value: InterviewValue) => void;
}) {
  const id = `interview-${question.id}`;
  return (
    <div className={cn("space-y-2 rounded-[12px] border p-4", missing ? "border-rose-300 bg-rose-50/40 dark:bg-rose-950/20" : "bg-card")}>
      <label htmlFor={id} className="block text-sm font-medium">
        {question.prompt}
        {question.required ? <span className="ml-1 text-muted-foreground">*</span> : null}
      </label>
      {question.help ? <p className="text-xs text-muted-foreground">{question.help}</p> : null}
      <QuestionInput id={id} question={question} value={value} onChange={onChange} />
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
        <div className="flex gap-2" role="radiogroup" aria-labelledby={id}>
          {[
            { label: "Yes", choice: true },
            { label: "No", choice: false },
          ].map((option) => (
            <Button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={value === option.choice}
              variant={value === option.choice ? "default" : "outline"}
              className={value === option.choice ? undefined : "bg-card"}
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
      return <Textarea id={id} rows={3} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
    default:
      if (question.field === "escrowPhone") {
        return <PhoneInput id={id} value={typeof value === "string" ? value : ""} autoComplete="off" onValueChange={(next) => onChange(next || null)} />;
      }
      return <Input id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  }
}
