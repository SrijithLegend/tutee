interface ExplainPanelProps {
  reason: string;
}

/** Renders a Decision's selection reason verbatim — the app's one-line explainability requirement. */
export default function ExplainPanel({ reason }: ExplainPanelProps) {
  return (
    <p className="mb-4 rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/50">
      <span className="text-white/30">Why this: </span>
      {reason}
    </p>
  );
}
