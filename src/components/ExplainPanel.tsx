interface ExplainPanelProps {
  reason: string;
}

/** Renders a Decision's selection reason verbatim — the app's one-line explainability requirement. */
export default function ExplainPanel({ reason }: ExplainPanelProps) {
  return (
    <p className="mb-4 border-l-2 border-hairline pl-3 text-xs text-muted">
      <span className="uppercase tracking-wide text-muted/70">Why this — </span>
      {reason}
    </p>
  );
}
