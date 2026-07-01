"use client";

import { useState } from "react";

export function Controls({
  onDetect,
  onInject,
}: {
  onDetect: () => Promise<void>;
  onInject: () => Promise<void>;
}) {
  const [detecting, setDetecting] = useState(false);
  const [injecting, setInjecting] = useState(false);

  return (
    <div className="flex gap-3">
      <button
        onClick={async () => {
          setInjecting(true);
          try {
            await onInject();
          } finally {
            setInjecting(false);
          }
        }}
        disabled={injecting}
        className="px-4 py-2 rounded-md bg-[var(--accent-danger-dim)] border border-[var(--accent-danger)]/40 text-[var(--accent-danger)] text-sm font-medium hover:bg-[var(--accent-danger)]/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-[family-name:var(--font-body)]"
      >
        {injecting ? "Injecting…" : "Inject Fraud Ring"}
      </button>
      <button
        onClick={async () => {
          setDetecting(true);
          try {
            await onDetect();
          } finally {
            setDetecting(false);
          }
        }}
        disabled={detecting}
        className="px-4 py-2 rounded-md bg-[var(--accent-brand)] text-[#0a0d12] text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {detecting ? "Analyzing graph…" : "Run Detection"}
      </button>
    </div>
  );
}
