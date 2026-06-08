import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkflowStepId = 'paste' | 'preview' | 'done';

const STEPS: { id: WorkflowStepId; label: string }[] = [
  { id: 'paste', label: '貼上訊息' },
  { id: 'preview', label: '預覽確認' },
  { id: 'done', label: '建立完成' },
];

function stepIndex(id: WorkflowStepId) {
  return STEPS.findIndex((s) => s.id === id);
}

export function WorkflowSteps({ active }: { active: WorkflowStepId }) {
  const activeIdx = stepIndex(active);

  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((step, idx) => {
        const done = idx < activeIdx;
        const current = idx === activeIdx;

        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  done && 'bg-primary text-primary-foreground',
                  current && 'bg-primary/20 text-primary ring-2 ring-primary/50',
                  !done && !current && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : idx + 1}
              </span>
              <span
                className={cn(
                  'truncate text-xs sm:text-sm',
                  current ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 ? (
              <div
                className={cn(
                  'hidden h-px flex-1 sm:block',
                  done ? 'bg-primary/50' : 'bg-border',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
