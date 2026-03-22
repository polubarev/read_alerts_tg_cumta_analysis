"use client";

import { ChartCard } from "@/components/ChartCard";
import { EChart } from "@/components/EChart";
import { MapPanel } from "@/components/MapPanel";
import { StatCard } from "@/components/StatCard";
import { useDashboardContext } from "@/components/DashboardProvider";

const CHART_MUTED = "#6b7280";
const CHART_RED = "#b91c1c";
const CHART_TEAL = "#0f766e";

export function GeographyView() {
  const { model, filters, replaceFilters } = useDashboardContext();
  if (!model || !filters) {
    return null;
  }

  return (
    <div className="pageStack">
      <section className="statGrid">
        <StatCard label="Mapped area points" value={model.qualityMetrics.mapped_area_count.toLocaleString("en-US")} />
        <StatCard label="Unmapped areas" value={model.qualityMetrics.unmapped_area_count.toLocaleString("en-US")} hint="Visible in quality tables, hidden from the map" />
        <StatCard label="Filtered districts" value={model.overviewMetrics.unique_districts.toLocaleString("en-US")} />
      </section>

      <ChartCard title="Area point map" subtitle="Clustered points only for curated mapped areas. Click a point to isolate that area.">
        <MapPanel
          height={560}
          points={model.mapPoints}
          onPointClick={(point) =>
            replaceFilters({
              ...filters,
              areas: [point.area]
            })
          }
        />
      </ChartCard>

      <div className="chartGrid chartGridWide">
        <ChartCard title="District ranking" subtitle="Click a district bar to isolate it across all routes.">
          <EChart
            option={{
              animation: false,
              tooltip: { trigger: "item" },
              grid: { left: 160, right: 20, top: 16, bottom: 24 },
              xAxis: {
                type: "value",
                axisLabel: { color: CHART_MUTED }
              },
              yAxis: {
                type: "category",
                axisLabel: { color: "#111827" },
                data: [...model.districtRankings.slice(0, 20)].reverse().map((row) => row.label)
              },
              series: [
                {
                  type: "bar",
                  data: [...model.districtRankings.slice(0, 20)].reverse().map((row) => row.count),
                  itemStyle: { color: CHART_RED, borderRadius: [0, 6, 6, 0] }
                }
              ]
            }}
            height={500}
            onEvents={{
              click: (params: { name?: string }) => {
                if (!params.name) {
                  return;
                }
                replaceFilters({
                  ...filters,
                  districts: [params.name]
                });
              }
            }}
          />
        </ChartCard>
        <ChartCard title="Area ranking" subtitle="Area labels remain exactly as parsed from the channel export.">
          <EChart
            option={{
              animation: false,
              tooltip: { trigger: "item" },
              grid: { left: 180, right: 20, top: 16, bottom: 24 },
              xAxis: {
                type: "value",
                axisLabel: { color: CHART_MUTED }
              },
              yAxis: {
                type: "category",
                axisLabel: { color: "#111827" },
                data: [...model.areaRankings.slice(0, 20)].reverse().map((row) => row.label)
              },
              series: [
                {
                  type: "bar",
                  data: [...model.areaRankings.slice(0, 20)].reverse().map((row) => ({
                    value: row.count,
                    area: row.area
                  })),
                  itemStyle: { color: CHART_TEAL, borderRadius: [0, 6, 6, 0] }
                }
              ]
            }}
            height={500}
            onEvents={{
              click: (params: { data?: { area?: string } }) => {
                const area = params.data?.area;
                if (!area) {
                  return;
                }
                replaceFilters({
                  ...filters,
                  areas: [area]
                });
              }
            }}
          />
        </ChartCard>
      </div>
    </div>
  );
}
