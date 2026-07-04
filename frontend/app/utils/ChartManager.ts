import {
  ColorType,
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

const DEBUG = process.env.NODE_ENV !== "production";

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

export type ChartType = "candlestick" | "line";

export class ChartManager {
  private candleSeries: ISeriesApi<"Candlestick"> | null = null;
  private lineSeries: ISeriesApi<"Line"> | null = null;
  private chart: IChartApi;

  constructor(
    ref: any,
    initialData: any[],
    layout: { background: string; color: string },
    chartType: ChartType = "candlestick"
  ) {
    try {
      log("📊 Initializing chart with", initialData?.length || 0, "candles");

      const chart = createChart(ref, {
        width: ref.clientWidth || ref.offsetWidth || 800,
        height: ref.clientHeight || ref.offsetHeight || 420,
        layout: {
          background: {
            type: ColorType.Solid,
            color: layout.background,
          },
          textColor: layout.color,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: "#23242C",
        },
        timeScale: {
          borderColor: "#23242C",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      this.chart = chart;

      // Handle resize
      const resizeObserver = new ResizeObserver((entries) => {
        if (entries.length === 0 || entries[0]?.target !== ref) {
          return;
        }
        const newRect = entries[0]!.contentRect;
        this.chart.applyOptions({
          width: newRect.width,
          height: newRect.height,
        });
      });
      resizeObserver.observe(ref);

      if (chartType === "candlestick") {
        this.candleSeries = this.chart.addCandlestickSeries({
          upColor: "#00C087",
          downColor: "#EF454A",
          borderVisible: false,
          wickUpColor: "#00C087",
          wickDownColor: "#EF454A",
        });
      } else {
        this.lineSeries = this.chart.addLineSeries({
          color: "#2962FF",
          lineWidth: 2,
          priceLineVisible: true,
          lastValueVisible: true,
        });
      }

      // Format and validate data
      const formattedOHLC = initialData
        .map((data) => {
          let timestamp: number;
          if (data.timestamp instanceof Date) {
            timestamp = Math.floor(data.timestamp.getTime() / 1000);
          } else if (typeof data.timestamp === "number") {
            timestamp = data.timestamp > 10000000000
              ? Math.floor(data.timestamp / 1000)
              : data.timestamp;
          } else {
            return null;
          }

          if (isNaN(timestamp) || timestamp <= 0) return null;

          return {
            time: timestamp as UTCTimestamp,
            open: parseFloat(data.open?.toString() || "0"),
            high: parseFloat(data.high?.toString() || "0"),
            low: parseFloat(data.low?.toString() || "0"),
            close: parseFloat(data.close?.toString() || "0"),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .filter(
          (item) =>
            !isNaN(item.open) && !isNaN(item.close) &&
            item.open > 0 && item.close > 0
        )
        .sort((a, b) => a.time - b.time)
        .filter((item, index, array) => {
          if (index === 0) return true;
          return item.time !== array[index - 1]!.time;
        });

      log("📊 Formatted", formattedOHLC.length, "valid candles");

      if (formattedOHLC.length > 0) {
        // Final validation
        for (let i = 1; i < formattedOHLC.length; i++) {
          if (formattedOHLC[i]!.time <= formattedOHLC[i - 1]!.time) {
            throw new Error("Chart data must be sorted in ascending order");
          }
        }

        if (this.candleSeries) {
          this.candleSeries.setData(formattedOHLC);
        } else if (this.lineSeries) {
          // For line chart, use close price
          this.lineSeries.setData(
            formattedOHLC.map((d) => ({ time: d.time, value: d.close }))
          );
        }

        log("✅ Chart initialized with", formattedOHLC.length, "data points");
      } else {
        console.warn("⚠️ No valid chart data to display");
      }
    } catch (error) {
      console.error("❌ Error initializing chart:", error);
      throw error;
    }
  }

  public update(updatedPrice: any) {
    try {
      log("📊 Updating chart with:", updatedPrice);

      const updateTime = updatedPrice.time
        ? updatedPrice.time > 1e12
          ? Math.floor(updatedPrice.time / 1000)
          : Math.floor(updatedPrice.time)
        : Math.floor(Date.now() / 1000);

      if (this.candleSeries) {
        this.candleSeries.update({
          time: updateTime as UTCTimestamp,
          close: parseFloat(updatedPrice.close),
          low: parseFloat(updatedPrice.low),
          high: parseFloat(updatedPrice.high),
          open: parseFloat(updatedPrice.open),
        });
      } else if (this.lineSeries) {
        this.lineSeries.update({
          time: updateTime as UTCTimestamp,
          value: parseFloat(updatedPrice.close),
        });
      }

      log("✅ Chart updated successfully");
    } catch (error) {
      console.error("❌ Error updating chart:", error);
    }
  }

  public destroy() {
    try {
      if (this.chart) {
        this.chart.remove();
      }
    } catch (error) {
      console.error("❌ Error destroying chart:", error);
    }
  }
}
