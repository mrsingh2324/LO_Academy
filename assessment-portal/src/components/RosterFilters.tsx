"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stageOptionsForBucket, STAGE_LABELS } from "@/lib/enums";

export default function RosterFilters({
  buckets,
  yogs,
  sizes,
  q,
  stage,
  bucket,
  yog,
  size,
}: {
  buckets: { name: string }[];
  yogs: number[];
  sizes: number[];
  q?: string;
  stage?: string;
  bucket?: string;
  yog?: string;
  size?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(q ?? "");
  const [bucketSel, setBucketSel] = useState(bucket ?? "");
  const [stageSel, setStageSel] = useState(stage ?? "");
  const [yogSel, setYogSel] = useState(yog ?? "");
  const [sizeSel, setSizeSel] = useState(size ?? "20");

  // Stage options cascade from the selected bucket (A→Nxtmock/TR1/TR2, B→Dev test/TR1/TR2, C→TR1, D→Not qualified).
  const stageOpts = stageOptionsForBucket(bucketSel || null);

  function go(override: { size?: string } = {}) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (stageSel) params.set("stage", stageSel);
    if (bucketSel) params.set("bucket", bucketSel);
    if (yogSel) params.set("yog", yogSel);
    const sz = override.size ?? sizeSel;
    if (sz && sz !== "20") params.set("size", sz);
    router.push(`/org/roster${params.toString() ? `?${params}` : ""}`);
  }
  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    go();
  }

  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name / email / id"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
      />
      <select
        value={bucketSel}
        onChange={(e) => {
          const nb = e.target.value;
          setBucketSel(nb);
          // reset stage if it's not valid for the new bucket
          if (stageSel && !stageOptionsForBucket(nb || null).includes(stageSel as never)) setStageSel("");
        }}
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
      >
        <option value="">All buckets</option>
        {buckets.map((b) => (
          <option key={b.name} value={b.name}>
            Bucket {b.name}
          </option>
        ))}
      </select>
      <select
        value={stageSel}
        onChange={(e) => setStageSel(e.target.value)}
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
      >
        <option value="">{bucketSel ? `All ${bucketSel} stages` : "All stages"}</option>
        {stageOpts.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s] ?? s}
          </option>
        ))}
      </select>
      <select
        value={yogSel}
        onChange={(e) => setYogSel(e.target.value)}
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
      >
        <option value="">All YOG</option>
        {yogs.map((y) => (
          <option key={y} value={y}>
            YOG {y}
          </option>
        ))}
      </select>
      <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Filter</button>
      <span className="ml-1 flex items-center gap-1 text-sm text-zinc-500">
        Show
        <select
          value={sizeSel}
          onChange={(e) => {
            setSizeSel(e.target.value);
            go({ size: e.target.value });
          }}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
        >
          {sizes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </span>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setBucketSel("");
          setStageSel("");
          setYogSel("");
          setSizeSel("20");
          router.push("/org/roster");
        }}
        className="text-sm text-zinc-500 hover:underline"
      >
        Reset
      </button>
    </form>
  );
}
