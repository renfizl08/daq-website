import { useState } from "react";
import { getChartData } from "../api/datasets";
import { useDatasetSchema } from "../hooks/useDatasetSchema";
import {
  computedSchemaColumns,
  convertChartData,
  sourceUnit,
} from "../lib/units";
import type { ChartRequest, PlotTrace, AxisTitles } from "../types/chart";
import { ChartBuilder } from "./ChartBuilder";
import { Alert } from "./ui";
import { toElapsedTime } from "../lib/compare";

export type RunPlot = {
  slug: string;
  plotData: PlotTrace[];
  axisTitles: AxisTitles | null;
};

type RunControlsProps = {
  slug: string;
  label: string;
  onData: (plot: RunPlot) => void;
};

export function RunControls({ slug, label, onData }: RunControlsProps) {
  const { columns, loading, error } = useDatasetSchema(slug);
  const [isLoading, setIsLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  async function runChart(
    payload: ChartRequest,
    titles: AxisTitles,
    displayUnits: Record<string, string>,
  ) {
    setIsLoading(true);
    setChartError(null);

    try {
      const result = await getChartData(slug, payload);

      const chartColumns = [
        ...columns,
        ...computedSchemaColumns(payload.computed_columns),
      ];

      const converted = convertChartData(
        result.data as PlotTrace[],
        payload,
        chartColumns,
        displayUnits,
      );

      const timeColumn = chartColumns.find(
        (column) => column.name === payload.x_column,
      );

      if (timeColumn?.type !== "numeric") {
        throw new Error("Choose a numeric time column for the X axis.");
      }

      const timeUnit = displayUnits[timeColumn.name] || sourceUnit(timeColumn);

      const elapsed = toElapsedTime(converted, timeUnit);

      const plotData = elapsed.map((trace) => {
        const name = String(trace.name ?? "");
        const column = Object.keys(titles.traceAxisByColumn).find(
          (column) => name === column || name.endsWith(` - ${column}`),
        );
        const traceLabel = column
          ? name.slice(0, name.length - column.length) +
            (titles.traceLabels[column] || column)
          : name;

        return {
          ...trace,
          yaxis: column ? titles.traceAxisByColumn[column] : "y",
          name: `${label} — ${traceLabel}`,
        };
      });

      onData({ slug, plotData, axisTitles: titles });
    } catch (err: unknown) {
      setChartError(
        err instanceof Error ? err.message : "Failed to load chart data",
      );

      onData({ slug, plotData: [], axisTitles: null });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="grid gap-3">
      <h3 className="text-base font-semibold">{label}</h3>

      {loading && <p className="text-sm text-muted">Loading channels...</p>}

      {error && <Alert tone="danger">{error}</Alert>}

      {!loading && !error && (
        <ChartBuilder columns={columns} onRun={runChart} />
      )}
      {isLoading && <p className="text-sm text-muted">Rendering graph...</p>}
      {chartError && (
        <Alert tone="danger">Chart load failed: {chartError}</Alert>
      )}
    </section>
  );
}
