import React, { useMemo } from "react";
import Plot from "react-plotly.js";

interface Map3DViewerProps {
  gridData: number[][];
  rowHeaders: number[];
  colHeaders: number[];
  inputChannelX: string;
  inputChannelY: string;
  outputChannelName: string;
  gainVal: number;
  offsetVal: number;
}

export default function Map3DViewer({
  gridData,
  rowHeaders,
  colHeaders,
  inputChannelX,
  inputChannelY,
  outputChannelName,
  gainVal,
  offsetVal,
}: Map3DViewerProps) {
  // Detect 1D vs 2D
  const is1D = rowHeaders.length === 1 || colHeaders.length === 1;

  const { data, layout } = useMemo(() => {
    // Apply gain & offset to display values
    const displayGrid = gridData.map((row) =>
      row.map((v) => (Number.isFinite(v) ? v * gainVal + offsetVal : NaN))
    );

    if (is1D) {
      // 2D Plot for 1D maps
      let xData: number[];
      let yData: number[];
      let xLabel: string;
      let yLabel: string;

      if (rowHeaders.length === 1) {
        // Single row: X-axis = colHeaders, Y-axis = gridData[0]
        xData = colHeaders;
        yData = displayGrid[0];
        xLabel = inputChannelX;
        yLabel = outputChannelName;
      } else {
        // Single column: X-axis = rowHeaders, Y-axis = gridData[:][0]
        xData = rowHeaders;
        yData = displayGrid.map((row) => row[0]);
        xLabel = inputChannelY;
        yLabel = outputChannelName;
      }

      const trace = {
        x: xData,
        y: yData,
        type: "scatter" as const,
        mode: "lines+markers" as const,
        name: outputChannelName,
        line: {
          color: "#ff2d4f",
          width: 3,
        },
        marker: {
          color: "#ff2d4f",
          size: 6,
        },
      };

      const layout = {
        title: `${outputChannelName} (1D)`,
        xaxis: { title: xLabel, gridcolor: "rgba(255, 93, 120, 0.16)" },
        yaxis: { title: yLabel, gridcolor: "rgba(255, 93, 120, 0.16)" },
        plot_bgcolor: "#1b0a0e",
        paper_bgcolor: "#14080b",
        font: { color: "#e5e7eb" },
        hovermode: "closest" as const,
        margin: { l: 50, r: 30, t: 40, b: 40 },
      };

      return { data: [trace], layout };
    } else {
      // 3D Surface plot for 2D maps
      const trace = {
        z: displayGrid,
        x: colHeaders,
        y: rowHeaders,
        type: "surface" as const,
        colorscale: [
          [0, "rgba(34, 197, 94, 0.8)"],    // Green (min)
          [0.5, "rgba(249, 115, 22, 0.8)"], // Orange (mid)
          [1, "rgba(239, 68, 68, 0.8)"],    // Red (max)
        ],
        showscale: true,
        colorbar: {
          title: outputChannelName,
          thickness: 15,
          len: 0.7,
          tickcolor: "#e5e7eb",
        },
        name: outputChannelName,
      };

      const layout = {
        title: `${outputChannelName} - 3D Map`,
        scene: {
          xaxis: {
            title: inputChannelX,
            gridcolor: "rgba(255, 93, 120, 0.16)",
            showbackground: true,
            backgroundcolor: "rgba(20, 8, 11, 0.5)",
          },
          yaxis: {
            title: inputChannelY,
            gridcolor: "rgba(255, 93, 120, 0.16)",
            showbackground: true,
            backgroundcolor: "rgba(20, 8, 11, 0.5)",
          },
          zaxis: {
            title: outputChannelName,
            gridcolor: "rgba(255, 93, 120, 0.16)",
            showbackground: true,
            backgroundcolor: "rgba(20, 8, 11, 0.5)",
          },
          camera: {
            eye: { x: 1.5, y: 1.5, z: 1.2 },
          },
        },
        plot_bgcolor: "#1b0a0e",
        paper_bgcolor: "#14080b",
        font: { color: "#e5e7eb" },
        hovermode: "closest" as const,
        margin: { l: 0, r: 0, t: 40, b: 0 },
        autosize: true,
      };

      return { data: [trace], layout };
    }
  }, [gridData, rowHeaders, colHeaders, inputChannelX, inputChannelY, outputChannelName, gainVal, offsetVal, is1D]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "400px" }}>
      <Plot
        data={data}
        layout={layout}
        style={{ width: "100%", height: "100%" }}
        config={{ responsive: true, displayModeBar: true }}
      />
    </div>
  );
}
