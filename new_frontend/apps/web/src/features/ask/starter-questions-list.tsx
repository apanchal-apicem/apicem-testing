import { ArrowUpRight } from "lucide-react";
import type { StarterQuestion } from "@/api/mock/fixtures";

export function StarterQuestionsList({
  questions,
  onSelect,
}: {
  questions: StarterQuestion[];
  onSelect: (question: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {questions.map((q) => (
        <li key={q.id}>
          <button
            onClick={() => onSelect(q.question)}
            className="group flex w-full items-start justify-between gap-2 rounded-(--radius-sm) px-2.5 py-2 text-left text-[13px] text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <span>{q.question}</span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  );
}
