"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useId, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { MapPoint } from "@/lib/types";

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm"
    }
  ]
};

export function MapPanel({
  points,
  height = 420,
  onPointClick
}: {
  points: MapPoint[];
  height?: number;
  onPointClick?: (point: MapPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onPointClickRef = useRef(onPointClick);
  const sourceId = useId().replaceAll(":", "");
  const clusterLayerId = `${sourceId}-clusters`;
  const countLayerId = `${sourceId}-counts`;
  const pointLayerId = `${sourceId}-points`;

  onPointClickRef.current = onPointClick;

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.map((point) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [point.lng, point.lat]
        },
        properties: point
      }))
    }),
    [points]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current || points.length === 0) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [34.95, 31.75],
      zoom: 6.1,
      attributionControl: { compact: true }
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource(sourceId, {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterRadius: 38,
        clusterMaxZoom: 10
      });

      map.addLayer({
        id: clusterLayerId,
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#a32020",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            8,
            24,
            20,
            30
          ],
          "circle-opacity": 0.78
        }
      });

      map.addLayer({
        id: countLayerId,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Bold"],
          "text-size": 12
        },
        paint: {
          "text-color": "#fffaf0"
        }
      });

      map.addLayer({
        id: pointLayerId,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#f97316",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff7ed"
        }
      });

      const bounds = new maplibregl.LngLatBounds();
      for (const point of points) {
        bounds.extend([point.lng, point.lat]);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
      }

      map.on("click", clusterLayerId, async (event) => {
        const feature = event.features?.[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource & {
          getClusterExpansionZoom: (id: number, callback: (error: Error | null, zoom: number) => void) => void;
        };
        if (Number.isNaN(clusterId) || !source) {
          return;
        }
        source.getClusterExpansionZoom(clusterId, (loadError, zoom) => {
          if (loadError) {
            return;
          }
          const coordinates = (feature?.geometry as { coordinates: [number, number] } | undefined)?.coordinates;
          if (!coordinates) {
            return;
          }
          map.easeTo({ center: coordinates, zoom });
        });
      });

      map.on("click", pointLayerId, (event) => {
        const properties = event.features?.[0]?.properties as unknown as MapPoint | undefined;
        if (!properties || !onPointClickRef.current) {
          return;
        }
        onPointClickRef.current(properties);
      });

      map.on("mouseenter", clusterLayerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseenter", pointLayerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", clusterLayerId, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseleave", pointLayerId, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [clusterLayerId, countLayerId, geojson, pointLayerId, points, sourceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    }
  }, [geojson, sourceId]);

  if (points.length === 0) {
    return (
      <div className="mapEmpty">
        <h3>No mapped areas in the current filter</h3>
        <p>The filtered occurrences are still available in the rankings, events, and quality tables.</p>
      </div>
    );
  }

  return <div ref={containerRef} className="mapPanel" style={{ height }} />;
}
