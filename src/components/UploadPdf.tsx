"use client";

import { useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/path";

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface UploadPdfProps {
  onGraphUpdate: (graph: Graph) => void;
}

export default function UploadPdf({ onGraphUpdate }: UploadPdfProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  function pickFile() {
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;

    setStatus("uploading");
    setError(null);
    const formData = new FormData();
    formData.append("pdf", file);

    fetch("/api/upload", { method: "POST", body: formData })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Upload failed");
        onGraphUpdate(data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setStatus("idle"));
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
      <button
        onClick={pickFile}
        disabled={status === "uploading"}
        className="rounded border border-hairline px-3 py-1.5 text-xs uppercase tracking-wide text-muted transition-colors hover:border-foreground/40 hover:bg-black/5 disabled:opacity-50"
      >
        {status === "uploading" ? "Analyzing PDF…" : "Upload PDF"}
      </button>
      {error && <span className="max-w-[16rem] truncate text-xs text-[#b8791f]" title={error}>{error}</span>}
    </div>
  );
}
