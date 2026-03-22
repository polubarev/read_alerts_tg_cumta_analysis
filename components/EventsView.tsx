"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardContext } from "@/components/DashboardProvider";
import { formatIsoTimestamp } from "@/lib/date";

export function EventsView() {
  const { model } = useDashboardContext();
  const [selectedAlarmTime, setSelectedAlarmTime] = useState<string | null>(null);

  useEffect(() => {
    if (!model) {
      return;
    }
    if (!selectedAlarmTime || !model.eventBursts.some((row) => row.alarm_time === selectedAlarmTime)) {
      setSelectedAlarmTime(model.eventBursts[0]?.alarm_time ?? null);
    }
  }, [model, selectedAlarmTime]);

  const selectedBurst = useMemo(
    () => model?.eventBursts.find((row) => row.alarm_time === selectedAlarmTime) ?? null,
    [model, selectedAlarmTime]
  );

  if (!model) {
    return null;
  }

  return (
    <div className="pageStack">
      <div className="chartGrid chartGridTwoThirds">
        <section className="panel">
          <header className="panelHeader">
            <div>
              <h2>Largest filtered bursts</h2>
              <p>Sorted by distinct areas hit at the same alarm timestamp.</p>
            </div>
          </header>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Alarm time</th>
                  <th>Burst size</th>
                  <th>Total rows</th>
                  <th>Districts</th>
                </tr>
              </thead>
              <tbody>
                {model.eventBursts.slice(0, 100).map((row) => (
                  <tr
                    key={row.alarm_time}
                    className={row.alarm_time === selectedAlarmTime ? "tableRowActive" : undefined}
                    onClick={() => setSelectedAlarmTime(row.alarm_time)}
                  >
                    <td>{formatIsoTimestamp(row.alarm_time)}</td>
                    <td>{row.burst_size}</td>
                    <td>{row.total_occurrences}</td>
                    <td>{row.districts.slice(0, 4).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <header className="panelHeader">
            <div>
              <h2>Event detail</h2>
              <p>All areas, districts, and message ids for the selected timestamp.</p>
            </div>
          </header>
          {selectedBurst ? (
            <div className="detailStack">
              <div className="detailHero">
                <strong>{formatIsoTimestamp(selectedBurst.alarm_time)}</strong>
                <span>{selectedBurst.burst_size} distinct areas</span>
              </div>
              <div className="detailGrid">
                <article className="detailCard">
                  <h3>Alert types</h3>
                  <p>{selectedBurst.alert_types.join(", ")}</p>
                </article>
                <article className="detailCard">
                  <h3>Districts</h3>
                  <p>{selectedBurst.districts.join(", ")}</p>
                </article>
                <article className="detailCard">
                  <h3>Source message ids</h3>
                  <p>{selectedBurst.source_message_ids.join(", ")}</p>
                </article>
              </div>
              <article className="detailCard">
                <h3>Areas</h3>
                <div className="detailChipRow">
                  {selectedBurst.areas.map((area) => (
                    <span key={area} className="chip chipPassive">
                      {area}
                    </span>
                  ))}
                </div>
              </article>
            </div>
          ) : (
            <div className="emptyState">
              <p>No burst selected under the current filters.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
