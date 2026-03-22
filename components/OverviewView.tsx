"use client";

import { ChartCard } from "@/components/ChartCard";
import { EChart } from "@/components/EChart";
import { MapPanel } from "@/components/MapPanel";
import { OccurrencesTable } from "@/components/OccurrencesTable";
import { StatCard } from "@/components/StatCard";
import { useDashboardContext } from "@/components/DashboardProvider";
import { formatDateLabel, formatIsoTimestamp } from "@/lib/date";

const CHART_TEXT = "#111827";
const CHART_MUTED = "#6b7280";
const CHART_RED = "#b91c1c";
const CHART_ORANGE = "#f97316";
const CHART_TEAL = "#0f766e";

export function OverviewView() {
  const { model, filters, replaceFilters } = useDashboardContext();
  if (!model || !filters) {
    return null;
  }

  const dailyOption = {
    animation: false,
    color: [CHART_RED, CHART_ORANGE],
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 20, top: 24, bottom: 40 },
    xAxis: {
      type: "category",
      axisLabel: {
        color: CHART_MUTED,
        formatter: (value: string) => formatDateLabel(value)
      },
      data: model.dailyCounts.map((row) => row.date)
    },
    yAxis: {
      type: "value",
      axisLabel: { color: CHART_MUTED }
    },
    series: [
      {
        name: "Alerts",
        type: "bar",
        data: model.dailyCounts.map((row) => row.count),
        itemStyle: { borderRadius: [4, 4, 0, 0] }
      },
      {
        name: "7d avg",
        type: "line",
        smooth: true,
        data: model.dailyCounts.map((row) => row.rolling_average)
      }
    ]
  };

  const districtOption = {
    animation: false,
    tooltip: { trigger: "item" },
    grid: { left: 160, right: 20, top: 16, bottom: 24 },
    xAxis: {
      type: "value",
      axisLabel: { color: CHART_MUTED }
    },
    yAxis: {
      type: "category",
      axisLabel: { color: CHART_TEXT },
      data: [...model.districtRankings.slice(0, 10)].reverse().map((row) => row.label)
    },
    series: [
      {
        type: "bar",
        data: [...model.districtRankings.slice(0, 10)].reverse().map((row) => row.count),
        itemStyle: { color: CHART_RED, borderRadius: [0, 6, 6, 0] }
      }
    ]
  };

  const areaOption = {
    animation: false,
    tooltip: { trigger: "item" },
    grid: { left: 180, right: 20, top: 16, bottom: 24 },
    xAxis: {
      type: "value",
      axisLabel: { color: CHART_MUTED }
    },
    yAxis: {
      type: "category",
      axisLabel: { color: CHART_TEXT },
      data: [...model.areaRankings.slice(0, 10)].reverse().map((row) => row.label)
    },
    series: [
      {
        type: "bar",
        data: [...model.areaRankings.slice(0, 10)].reverse().map((row) => ({
          value: row.count,
          area: row.area,
          district: row.district
        })),
        itemStyle: { color: CHART_TEAL, borderRadius: [0, 6, 6, 0] }
      }
    ]
  };

  return (
    <div className="pageStack">
      <section className="statGrid">
        <StatCard label="Filtered alerts" value={model.overviewMetrics.total_alerts.toLocaleString("en-US")} hint="Occurrence rows after current filters" />
        <StatCard label="Unique areas" value={model.overviewMetrics.unique_areas.toLocaleString("en-US")} hint="Distinct area + district pairs" />
        <StatCard label="Unique districts" value={model.overviewMetrics.unique_districts.toLocaleString("en-US")} hint="Administrative districts hit" />
        <StatCard
          label="Biggest day"
          value={
            model.overviewMetrics.biggest_day
              ? `${model.overviewMetrics.biggest_day.count.toLocaleString("en-US")}`
              : "n/a"
          }
          hint={
            model.overviewMetrics.biggest_day
              ? formatDateLabel(model.overviewMetrics.biggest_day.date)
              : "No rows in filter"
          }
        />
        <StatCard
          label="Biggest burst"
          value={
            model.overviewMetrics.biggest_burst
              ? `${model.overviewMetrics.biggest_burst.burst_size.toLocaleString("en-US")}`
              : "n/a"
          }
          hint={
            model.overviewMetrics.biggest_burst
              ? formatIsoTimestamp(model.overviewMetrics.biggest_burst.alarm_time)
              : "No rows in filter"
          }
        />
      </section>

      <div className="chartGrid chartGridWide">
        <ChartCard title="Daily trend" subtitle="Daily counts and the 7-day rolling mean. Click a bar to isolate a day.">
          <EChart
            option={dailyOption}
            height={320}
            onEvents={{
              click: (params: { name?: string }) => {
                if (!params.name) {
                  return;
                }
                replaceFilters({ ...filters, date_from: params.name, date_to: params.name });
              }
            }}
          />
        </ChartCard>
        <ChartCard title="Top districts" subtitle="Highest-volume districts under the current filter.">
          <EChart
            option={districtOption}
            height={320}
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
        <ChartCard title="Top areas" subtitle="Most frequent area labels, kept exactly as parsed from the source.">
          <EChart
            option={areaOption}
            height={320}
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

      <div className="chartGrid chartGridTwoThirds">
        <ChartCard title="Mapped hotspots" subtitle="Clustered area points from the curated lookup. Click a point to add that area filter.">
          <MapPanel
            height={360}
            points={model.mapPoints}
            onPointClick={(point) =>
              replaceFilters({
                ...filters,
                areas: [point.area]
              })
            }
          />
        </ChartCard>
        <section className="panel">
          <header className="panelHeader">
            <div>
              <h2>Largest bursts</h2>
              <p>Grouped by exact alarm timestamp.</p>
            </div>
          </header>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Alarm time</th>
                  <th>Burst size</th>
                  <th>Districts</th>
                  <th>Alert types</th>
                </tr>
              </thead>
              <tbody>
                {model.eventBursts.slice(0, 10).map((row) => (
                  <tr key={row.alarm_time}>
                    <td>{formatIsoTimestamp(row.alarm_time)}</td>
                    <td>{row.burst_size}</td>
                    <td>{row.districts.slice(0, 3).join(", ")}</td>
                    <td>{row.alert_types.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <OccurrencesTable rows={model.filteredOccurrences} title="Filtered occurrences" />
    </div>
  );
}
