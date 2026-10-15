import { useState } from "react";
import { useDatasets } from "../hooks/useDatasets";
import { Alert, FieldSelect, Label, Panel } from "../components/ui";
import { ChartBuilder } from "../components/ChartBuilder";
import { useDatasetSchema } from "@/hooks/useDatasetSchema";
import { getChartData } from "../api/datasets";
import type { PlotTrace } from "../types/chart";
import { convertChartData } from "../lib/units";
import { PlotView } from "../components/PlotView";

type Props = {
  theme: "light" | "dark";
};
type GraphState = {
  slug: string;
  plotData: PlotTrace[];
};
type RunControlsProps = {
  slug: string;
  label: string;
  onData: (plot: GraphState) => void;
};
function RunControls({ slug, label, onData }: RunControlsProps) {
  const { columns, loading, error } = useDatasetSchema(slug);
  const [isLoading, setIsLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  return (
    <section className="grid gap-3">
      <h3 className="text-base font-semibold">{label}</h3>

      {loading && <p className="text-sm text-muted">Loading channels...</p>}

      {error && <Alert tone="danger">{error}</Alert>}

      {!loading && !error && (
        <ChartBuilder
          columns={columns}
          onRun={async (payload, titles, displayUnits) => {
            setIsLoading(true);
            setChartError(null);

            try {
              const result = await getChartData(slug, payload);

              const converted = convertChartData(
                result.data as PlotTrace[],
                payload,
                columns,
                displayUnits,
              );

              const plotData = converted.map((trace) => {
                const name = String(trace.name ?? "");

                return {
                  ...trace,
                  name: `${label} — ${titles.traceLabels[name] || name}`,
                };
              });

              onData({ slug, plotData });
            } catch (err: unknown) {
              setChartError(
                err instanceof Error
                  ? err.message
                  : "Failed to load chart data",
              );

              onData({ slug, plotData: [] });
            } finally {
              setIsLoading(false);
            }
          }}
        />
      )}
      {isLoading && <p className="text-sm text-muted">Rendering graph...</p>}
      {chartError && (
        <Alert tone="danger">Chart load failed: {chartError}</Alert>
      )}
    </section>
  );
}
export function ComparePage({ theme }: Props) {
  const { datasets, loading, error } = useDatasets();

  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [graphA, setGraphA] = useState<GraphState | null>(null);
  const [graphB, setGraphB] = useState<GraphState | null>(null);

  const selections = [
    { label: "Run A", value: runA, update: setRunA },
    { label: "Run B", value: runB, update: setRunB },
  ];
  const plotData = [
    ...(graphA?.slug === runA ? graphA.plotData : []),
    ...(graphB?.slug === runB ? graphB.plotData : []),
  ];
  return (
    <main className="grid gap-4">
      <Panel className="grid gap-4 p-4">
        <h2 className="text-base font-semibold">Compare runs</h2>

        {loading && <p className="text-sm text-muted">Loading datasets...</p>}
        {error && <Alert tone="danger">{error}</Alert>}

        {selections.map((selection) => (
          <Label key={selection.label} className="grid gap-2">
            {selection.label}

            <FieldSelect
              value={selection.value}
              disabled={loading || Boolean(error)}
              onChange={(event) => selection.update(event.target.value)}
            >
              <option value="">Choose a Run</option>

              {datasets.map((dataset) => (
                <option key={dataset.slug} value={dataset.slug}>
                  {dataset.title}
                </option>
              ))}
            </FieldSelect>
          </Label>
        ))}

        <p>Run A: {runA || "None selected"}</p>
        <p>Run B: {runB || "None selected"}</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {runA && (
          <RunControls
            key={`a-${runA}`}
            slug={runA}
            label="Run A"
            onData={setGraphA}
          />
        )}

        {runB && (
          <RunControls
            key={`b-${runB}`}
            slug={runB}
            label="Run B"
            onData={setGraphB}
          />
        )}
      </div>

      <p className="text-sm text-muted">
        Run A loaded traces:{" "}
        {graphA?.slug === runA ? graphA.plotData.length : 0}
      </p>

      <p className="text-sm text-muted">
        Run B loaded traces:{" "}
        {graphB?.slug === runB ? graphB.plotData.length : 0}
      </p>

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-inner">
        <PlotView data={plotData} theme={theme} axisTitles={null} />
      </div>
    </main>
  );
}
