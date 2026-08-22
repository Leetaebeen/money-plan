interface StepIndicatorProps {
  labels: readonly string[];
  current: number;
}

export function StepIndicator({ labels, current }: StepIndicatorProps) {
  return (
    <nav className="steps" aria-label="계획 만들기 진행 단계">
      <p className="steps__count">{current + 1} / {labels.length}</p>
      <ol>
        {labels.map((label, index) => (
          <li
            key={label}
            className={index === current ? "is-current" : index < current ? "is-complete" : ""}
            aria-current={index === current ? "step" : undefined}
          >
            <span>{index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
    </nav>
  );
}
