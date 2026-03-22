"use client";

import { ChartCard } from "@/components/ChartCard";
import { EChart } from "@/components/EChart";
import { StatCard } from "@/components/StatCard";
import { useDashboardContext } from "@/components/DashboardProvider";

const CHART_MUTED = "#6b7280";
const CHART_RED = "#b91c1c";
const CHART_SLATE = "#334155";

export function QualityView() {
  const { model } = useDashboardContext();
  if (!model) {
    return null;
  }

  return (
    <div className="pageStack">
      <section className="statGrid">
        <StatCard label="Unknown alert rows" value={model.qualityMetrics.unknown_alert_rows.toLocaleString("en-US")} hint="Rows with no recoverable alert type" />
        <StatCard label="Unmapped areas" value={model.qualityMetrics.unmapped_area_count.toLocaleString("en-US")} hint="Filtered areas excluded from the map" />
        <StatCard label="Mapped areas" value={model.qualityMetrics.mapped_area_count.toLocaleString("en-US")} />
        <StatCard label="Parser issues" value={model.qualityMetrics.parse_issue_count.toLocaleString("en-US")} hint="Date-filtered parse issues from the ETL outputs" />
      </section>

      <div className="chartGrid chartGridWide">
        <ChartCard title="Issue type distribution" subtitle="Current issue mix from the parser outputs.">
          <EChart
            option={{
              animation: false,
              grid: { left: 48, right: 20, top: 24, bottom: 40 },
              xAxis: {
                type: "category",
                data: model.qualityMetrics.top_issue_types.map((row) => row.label),
                axisLabel: { color: CHART_MUTED, rotate: 18 }
              },
              yAxis: {
                type: "value",
                axisLabel: { color: CHART_MUTED }
              },
              series: [
                {
                  type: "bar",
                  data: model.qualityMetrics.top_issue_types.map((row) => row.count),
                  itemStyle: { color: CHART_RED, borderRadius: [4, 4, 0, 0] }
                }
              ]
            }}
            height={340}
          />
        </ChartCard>
        <ChartCard title="Top unmapped areas" subtitle="These are still counted in analytics but hidden from the map.">
          <EChart
            option={{
              animation: false,
              grid: { left: 220, right: 20, top: 16, bottom: 24 },
              xAxis: {
                type: "value",
                axisLabel: { color: CHART_MUTED }
              },
              yAxis: {
                type: "category",
                data: [...model.qualityMetrics.top_unmapped_areas.slice(0, 15)].reverse().map((row) => row.label),
                axisLabel: { color: "#111827" }
              },
              series: [
                {
                  type: "bar",
                  data: [...model.qualityMetrics.top_unmapped_areas.slice(0, 15)].reverse().map((row) => row.count),
                  itemStyle: { color: CHART_SLATE, borderRadius: [0, 6, 6, 0] }
                }
              ]
            }}
            height={340}
          />
        </ChartCard>
      </div>

      <div className="chartGrid chartGridWide">
        <section className="panel">
          <header className="panelHeader">
            <div>
              <h2>Recent parse issues</h2>
              <p>These come directly from the ETL issue log and are never silently dropped.</p>
            </div>
          </header>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Message date</th>
                  <th>Issue type</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {model.qualityMetrics.recent_issues.map((issue, index) => (
                  <tr key={`${issue.message_id}-${issue.issue_type}-${issue.message_date}-${index}`}>
                    <td>{issue.message_date.replace("T", " ").slice(0, 16)}</td>
                    <td>{issue.issue_type}</td>
                    <td>{issue.context}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
