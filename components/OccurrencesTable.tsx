"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";
import { formatIsoTimestamp } from "@/lib/date";
import type { AlertOccurrence } from "@/lib/types";

export function OccurrencesTable({
  rows,
  title
}: {
  rows: AlertOccurrence[];
  title: string;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredRows = useMemo(() => {
    if (!deferredQuery.trim()) {
      return rows;
    }
    const needle = deferredQuery.toLowerCase();
    return rows.filter((row) =>
      [row.area, row.district, row.alert_type, row.alarm_time]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [deferredQuery, rows]);

  const visibleRows = filteredRows.slice(0, 200);

  return (
    <section className="panel">
      <header className="panelHeader panelHeaderStacked">
        <div>
          <h2>{title}</h2>
          <p>
            {filteredRows.length.toLocaleString("en-US")} rows after filter
            {filteredRows.length > visibleRows.length ? ", showing first 200" : ""}
          </p>
        </div>
        <div className="tableActions">
          <input
            className="searchInput"
            placeholder="Search the filtered rows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="actionButton"
            onClick={() =>
              downloadCsv(
                filteredRows.map((row) => ({
                  alarm_time: row.alarm_time,
                  district: row.district,
                  area: row.area,
                  alert_type: row.alert_type,
                  source_message_count: row.source_message_count,
                  source_message_ids: row.source_message_ids.join(" ")
                })),
                "filtered-occurrences.csv"
              )
            }
          >
            Export CSV
          </button>
        </div>
      </header>
      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Alarm time</th>
              <th>District</th>
              <th>Area</th>
              <th>Alert type</th>
              <th>Source rows</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.occurrence_id}>
                <td>{formatIsoTimestamp(row.alarm_time)}</td>
                <td>{row.district}</td>
                <td>{row.area}</td>
                <td>{row.alert_type}</td>
                <td>{row.source_message_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
