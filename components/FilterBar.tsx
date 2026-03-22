"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useDashboardContext } from "@/components/DashboardProvider";

export function FilterBar() {
  const {
    seed,
    filters,
    replaceFilters,
    resetFilters,
    toggleAlertType,
    selectAllAlertTypes,
    toggleDistrict,
    addArea,
    removeArea
  } = useDashboardContext();
  const [areaQuery, setAreaQuery] = useState("");
  const [districtQuery, setDistrictQuery] = useState("");
  const deferredAreaQuery = useDeferredValue(areaQuery);
  const deferredDistrictQuery = useDeferredValue(districtQuery);

  const suggestedAreas = useMemo(() => {
    if (!seed || deferredAreaQuery.trim().length === 0) {
      return [];
    }
    const normalized = deferredAreaQuery.trim().toLowerCase();
    return seed.filter_options.areas
      .filter((value) => value.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [deferredAreaQuery, seed]);

  const visibleDistricts = useMemo(() => {
    if (!seed) {
      return [];
    }
    if (!deferredDistrictQuery.trim()) {
      return seed.filter_options.districts;
    }
    const normalized = deferredDistrictQuery.trim().toLowerCase();
    return seed.filter_options.districts.filter((value) => value.toLowerCase().includes(normalized));
  }, [deferredDistrictQuery, seed]);

  if (!seed || !filters) {
    return null;
  }

  const handleDateChange = (field: "date_from" | "date_to", value: string) => {
    replaceFilters({
      ...filters,
      [field]: value
    });
  };

  const handleAreaSubmit = (value: string) => {
    if (!value) {
      return;
    }
    addArea(value);
    setAreaQuery("");
  };

  return (
    <section className="filterBar panel">
      <div className="filterGroup">
        <span className="filterLabel">Date range</span>
        <div className="dateRange">
          <label className="inlineField">
            <span>From</span>
            <input
              type="date"
              min={seed.metadata.coverage_start.slice(0, 10)}
              max={filters.date_to}
              value={filters.date_from}
              onChange={(event) => handleDateChange("date_from", event.target.value)}
            />
          </label>
          <label className="inlineField">
            <span>To</span>
            <input
              type="date"
              min={filters.date_from}
              max={seed.metadata.coverage_end.slice(0, 10)}
              value={filters.date_to}
              onChange={(event) => handleDateChange("date_to", event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="filterGroup">
        <span className="filterLabel">Alert type</span>
        <div className="pillRow">
          {seed.filter_options.alert_types.map((value) => (
            <button
              key={value}
              type="button"
              className={filters.alert_types.includes(value) ? "pill pillActive" : "pill"}
              onClick={() => toggleAlertType(value)}
            >
              {value}
            </button>
          ))}
          <button type="button" className="pill pillGhost" onClick={selectAllAlertTypes}>
            All types
          </button>
        </div>
      </div>

      <div className="filterGroup filterGroupWide">
        <div className="filterRowSplit">
          <span className="filterLabel">Districts</span>
          <span className="filterMeta">
            {filters.districts.length > 0 ? `${filters.districts.length} selected` : "All districts"}
          </span>
        </div>
        <input
          className="searchInput"
          placeholder="Search districts"
          value={districtQuery}
          onChange={(event) => setDistrictQuery(event.target.value)}
        />
        <div className="checkboxGrid">
          {visibleDistricts.map((district) => (
            <label key={district} className="checkboxItem">
              <input
                type="checkbox"
                checked={filters.districts.includes(district)}
                onChange={() => toggleDistrict(district)}
              />
              <span>{district}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filterGroup filterGroupWide">
        <div className="filterRowSplit">
          <span className="filterLabel">Area search</span>
          <span className="filterMeta">
            {filters.areas.length > 0 ? `${filters.areas.length} selected` : "No area filter"}
          </span>
        </div>
        <div className="areaComposer">
          <input
            className="searchInput"
            list="areas-list"
            placeholder="Type an exact or partial area name"
            value={areaQuery}
            onChange={(event) => setAreaQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAreaSubmit(areaQuery);
              }
            }}
          />
          <datalist id="areas-list">
            {seed.filter_options.areas.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <button type="button" className="actionButton" onClick={() => handleAreaSubmit(areaQuery)}>
            Add area
          </button>
        </div>
        {suggestedAreas.length > 0 ? (
          <div className="suggestionRow">
            {suggestedAreas.map((value) => (
              <button key={value} type="button" className="pill" onClick={() => handleAreaSubmit(value)}>
                {value}
              </button>
            ))}
          </div>
        ) : null}
        {filters.areas.length > 0 ? (
          <div className="chipRow">
            {filters.areas.map((value) => (
              <button key={value} type="button" className="chip" onClick={() => removeArea(value)}>
                {value}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="filterActions">
        <button type="button" className="actionButton actionButtonSecondary" onClick={resetFilters}>
          Reset to red alerts
        </button>
      </div>
    </section>
  );
}
