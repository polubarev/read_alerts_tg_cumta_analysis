"use client";

import { ChartCard } from "@/components/ChartCard";
import { EChart } from "@/components/EChart";
import { useDashboardContext } from "@/components/DashboardProvider";
import { firstLastSeries } from "@/lib/dashboard-data";
import { formatDateLabel } from "@/lib/date";

const CHART_MUTED = "#6b7280";
const CHART_RED = "#b91c1c";
const CHART_ORANGE = "#f97316";
const CHART_GOLD = "#d97706";
const CHART_BLUE = "#1d4ed8";

export function TimeView() {
  const { model, filters, replaceFilters } = useDashboardContext();
  if (!model || !filters) {
    return null;
  }

  const firstLast = firstLastSeries(model.dailyCounts);

  return (
    <div className="pageStack">
      <div className="chartGrid chartGridWide">
        <ChartCard title="Daily counts and rolling trend" subtitle="Primary time-series view. Clicking a day sets the dashboard date range to that day.">
          <EChart
            option={{
              animation: false,
              color: [CHART_RED, CHART_ORANGE],
              tooltip: { trigger: "axis" },
              grid: { left: 44, right: 20, top: 24, bottom: 40 },
              xAxis: {
                type: "category",
                data: model.dailyCounts.map((row) => row.date),
                axisLabel: {
                  color: CHART_MUTED,
                  formatter: (value: string) => formatDateLabel(value)
                }
              },
              yAxis: {
                type: "value",
                axisLabel: { color: CHART_MUTED }
              },
              series: [
                {
                  type: "bar",
                  name: "Alerts",
                  data: model.dailyCounts.map((row) => row.count),
                  itemStyle: { borderRadius: [4, 4, 0, 0] }
                },
                {
                  type: "line",
                  smooth: true,
                  name: "7d avg",
                  data: model.dailyCounts.map((row) => row.rolling_average)
                }
              ]
            }}
            height={360}
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
        <ChartCard title="Hour of day" subtitle="Local Israel time, treated as local source time and not browser-local time.">
          <EChart
            option={{
              animation: false,
              grid: { left: 44, right: 20, top: 24, bottom: 40 },
              xAxis: {
                type: "category",
                data: model.hourOfDayCounts.map((row) => row.label),
                axisLabel: { color: CHART_MUTED }
              },
              yAxis: {
                type: "value",
                axisLabel: { color: CHART_MUTED }
              },
              series: [
                {
                  type: "bar",
                  data: model.hourOfDayCounts.map((row) => row.count),
                  itemStyle: { color: CHART_GOLD, borderRadius: [4, 4, 0, 0] }
                }
              ]
            }}
            height={360}
          />
        </ChartCard>
      </div>

      <div className="chartGrid chartGridWide">
        <ChartCard title="Weekday distribution" subtitle="Sun-first order to match the local calendar convention.">
          <EChart
            option={{
              animation: false,
              grid: { left: 44, right: 20, top: 24, bottom: 40 },
              xAxis: {
                type: "category",
                data: model.weekdayCounts.map((row) => row.label),
                axisLabel: { color: CHART_MUTED }
              },
              yAxis: {
                type: "value",
                axisLabel: { color: CHART_MUTED }
              },
              series: [
                {
                  type: "bar",
                  data: model.weekdayCounts.map((row) => row.count),
                  itemStyle: { color: CHART_RED, borderRadius: [4, 4, 0, 0] }
                }
              ]
            }}
            height={320}
          />
        </ChartCard>
        <ChartCard title="Weekday x hour heatmap" subtitle="Spot the hours and weekdays that combine into repeated hot windows.">
          <EChart
            option={{
              animation: false,
              tooltip: {
                formatter: (params: { data?: [number, number, number] }) =>
                  params.data
                    ? `${model.weekdayCounts[params.data[1]].label} ${String(params.data[0]).padStart(2, "0")}:00 — ${params.data[2]}`
                    : ""
              },
              grid: { left: 64, right: 20, top: 24, bottom: 40 },
              xAxis: {
                type: "category",
                data: model.hourOfDayCounts.map((row) => row.label),
                axisLabel: { color: CHART_MUTED }
              },
              yAxis: {
                type: "category",
                data: model.weekdayCounts.map((row) => row.label),
                axisLabel: { color: CHART_MUTED }
              },
              visualMap: {
                min: 0,
                max: Math.max(...model.weekdayHourHeatmap.map((row) => row.count), 1),
                orient: "horizontal",
                left: "center",
                bottom: 0,
                textStyle: { color: CHART_MUTED },
                inRange: {
                  color: ["#fff7ed", "#fdba74", "#ef4444", "#7f1d1d"]
                }
              },
              series: [
                {
                  type: "heatmap",
                  data: model.weekdayHourHeatmap.map((row) => [row.hour, row.weekday, row.count]),
                  emphasis: {
                    itemStyle: {
                      borderColor: "#fff",
                      borderWidth: 1
                    }
                  }
                }
              ]
            }}
            height={420}
          />
        </ChartCard>
      </div>

      <div className="chartGrid chartGridWide">
        <ChartCard title="Calendar heatmap" subtitle="Daily intensity on a full-calendar canvas for the selected date range.">
          <EChart
            option={{
              animation: false,
              tooltip: {
                formatter: (params: { data?: [string, number] }) =>
                  params.data ? `${formatDateLabel(params.data[0])}: ${params.data[1]}` : ""
              },
              visualMap: {
                min: 0,
                max: Math.max(...model.dailyCounts.map((row) => row.count), 1),
                calculable: false,
                orient: "horizontal",
                left: "center",
                bottom: 0,
                textStyle: { color: CHART_MUTED },
                inRange: {
                  color: ["#fff7ed", "#fdba74", "#ef4444", "#7f1d1d"]
                }
              },
              calendar: {
                top: 28,
                left: 32,
                right: 32,
                cellSize: ["auto", 20],
                range: [filters.date_from, filters.date_to],
                itemStyle: {
                  borderWidth: 1,
                  borderColor: "#f2e8d5"
                },
                dayLabel: { color: CHART_MUTED },
                monthLabel: { color: CHART_MUTED },
                yearLabel: { show: false }
              },
              series: [
                {
                  type: "heatmap",
                  coordinateSystem: "calendar",
                  data: model.dailyCounts.map((row) => [row.date, row.count])
                }
              ]
            }}
            height={360}
          />
        </ChartCard>
        <ChartCard title="Daily first and last alert" subtitle="Each point is derived from the source local timestamp, not the viewer timezone.">
          <EChart
            option={{
              animation: false,
              tooltip: {
                trigger: "axis"
              },
              legend: {
                top: 0,
                textStyle: { color: CHART_MUTED }
              },
              grid: { left: 48, right: 20, top: 48, bottom: 40 },
              xAxis: {
                type: "category",
                data: firstLast.map((row) => row.date),
                axisLabel: {
                  color: CHART_MUTED,
                  formatter: (value: string) => formatDateLabel(value)
                }
              },
              yAxis: {
                type: "value",
                min: 0,
                max: 24,
                axisLabel: {
                  color: CHART_MUTED,
                  formatter: (value: number) => `${String(Math.floor(value)).padStart(2, "0")}:00`
                }
              },
              series: [
                {
                  name: "First",
                  type: "line",
                  smooth: true,
                  data: firstLast.map((row) => row.first),
                  itemStyle: { color: CHART_BLUE }
                },
                {
                  name: "Last",
                  type: "line",
                  smooth: true,
                  data: firstLast.map((row) => row.last),
                  itemStyle: { color: CHART_ORANGE }
                }
              ]
            }}
            height={360}
          />
        </ChartCard>
      </div>
    </div>
  );
}
