"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export function RiskGauge({ riskScore }: { riskScore: number }) {
  const pct = riskScore * 100;
  
  // Modern color scheme matching the UI
  let color, bgGradient;
  if (riskScore < 0.3) {
    color = "#10b981"; // Modern emerald
    bgGradient = "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)";
  } else if (riskScore < 0.7) {
    color = "#f59e0b"; // Modern amber
    bgGradient = "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)";
  } else {
    color = "#ef4444"; // Modern red
    bgGradient = "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)";
  }

  return (
    <div style={{
      background: "#ffffff",
      borderRadius: "24px",
      padding: "2rem",
      border: "1px solid rgba(148, 163, 184, 0.25)",
      boxShadow: "0 8px 32px rgba(15, 23, 42, 0.08)",
      position: "relative",
      overflow: "hidden"
    }}>
      <Plot
        data={[
          {
            type: "indicator",
            mode: "gauge+number",
            value: pct,
            number: { 
              suffix: "%", 
              font: { 
                size: 56, 
                color: "#0f172a",
                family: "Space Grotesk, Inter, -apple-system, sans-serif",
                weight: "bold"
              } 
            },
            title: { 
              text: "ADR Risk Score", 
              font: { 
                size: 22, 
                color: "#1e293b",
                family: "Inter, -apple-system, sans-serif",
                weight: "600"
              },
              y: 0.85
            },
            domain: { x: [0, 1], y: [0, 1] },
            gauge: {
              axis: { 
                range: [0, 100], 
                tickfont: { 
                  color: "#475569",
                  size: 13,
                  family: "Inter, -apple-system, sans-serif"
                },
                tickcolor: "#94a3b8",
                tickwidth: 2,
                ticklen: 10,
                showticksuffix: "last",
                ticksuffix: "%"
              },
              bar: { 
                color: color,
                line: { width: 2, color: "#ffffff" }
              },
              bgcolor: "transparent",
              borderwidth: 0,
              steps: [
                { range: [0, 30], color: "#d1fae5", line: { width: 0 } },
                { range: [30, 70], color: "#fde68a", line: { width: 0 } },
                { range: [70, 100], color: "#fecaca", line: { width: 0 } }
              ],
              threshold: { 
                line: { color: "#dc2626", width: 3 }, 
                thickness: 0.85, 
                value: 90 
              },
              shape: "angular"
            }
          } as any
        ]}
        layout={{
          height: 320,
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          margin: { t: 40, r: 20, l: 20, b: 20 },
          font: {
            family: "Inter, -apple-system, sans-serif"
          }
        }}
        config={{ 
          displayModeBar: false,
          staticPlot: false,
          responsive: true
        }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
