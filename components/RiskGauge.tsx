"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export function RiskGauge({ riskScore }: { riskScore: number }) {
  const pct = riskScore * 100;
  const color = riskScore < 0.3 ? "#28a745" : riskScore < 0.7 ? "#fd7e14" : "#dc3545";

  return (
    <Plot
      data={[
        {
          type: "indicator",
          mode: "gauge+number",
          value: pct,
          number: { suffix: "%", font: { size: 32, color: "#1F2937" } },
          title: { text: "ADR Risk Score", font: { size: 18, color: "#1F2937" } },
          gauge: {
            axis: { range: [0, 100], tickfont: { color: "#6B7280" } },
            bar: { color },
            steps: [
              { range: [0, 30], color: "#ECFDF5" },
              { range: [30, 70], color: "#FEF3C7" },
              { range: [70, 100], color: "#FEE2E2" }
            ],
            threshold: { line: { color: "#DC2626", width: 4 }, thickness: 0.75, value: 90 }
          }
        } as any
      ]}
      layout={{
        height: 300,
        paper_bgcolor: "white",
        plot_bgcolor: "white",
        margin: { t: 30, r: 10, l: 10, b: 10 }
      }}
      config={{ displayModeBar: false }}
    />
  );
}


