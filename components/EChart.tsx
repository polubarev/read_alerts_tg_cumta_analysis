"use client";

import dynamic from "next/dynamic";
import * as echarts from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function EChart({
  option,
  height = 320,
  onEvents
}: {
  option: echarts.EChartsCoreOption;
  height?: number;
  onEvents?: Record<string, (params: any) => void>;
}) {
  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      style={{ height }}
      onEvents={onEvents}
    />
  );
}
