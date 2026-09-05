import { wantsTopic } from "./focus.js";
import { tw } from "./ui.js";

export { wantsTopic };

export function TopicBar<T extends string>({
  all,
  selected,
  onChange,
  labels,
}: {
  all: readonly T[];
  selected: T[] | undefined;
  onChange: (next: T[] | undefined) => void;
  labels: Record<T, string>;
}) {
  const active = selected ?? [];
  const isFull = active.length === 0;

  return (
    <div className={tw.actions}>
      <button
        type="button"
        className={isFull ? tw.btnPrimary : tw.btn}
        onClick={() => onChange(undefined)}
      >
        Full
      </button>
      {all.map((topic) => {
        const on = active.includes(topic);
        return (
          <button
            key={topic}
            type="button"
            className={on ? tw.btnPrimary : tw.btn}
            onClick={() => {
              const next = on ? active.filter((item) => item !== topic) : [...active, topic];
              onChange(next.length === 0 || next.length === all.length ? undefined : next);
            }}
          >
            {labels[topic]}
          </button>
        );
      })}
    </div>
  );
}
