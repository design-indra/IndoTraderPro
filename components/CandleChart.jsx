'use client';

import { useEffect, useRef, useState } from 'react';

export default function CandleChart({ candles = [], trades = [], openPositions = [], pair }) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const seriesRef = useRef(null);
  const ema9Ref = useRef(null);
  const ema21Ref = useRef(null);
  const markersRef = useRef([]);
  const [chartReady, setChartReady] = useState(false);

  // ─── Initialize chart ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let chart = null;

    const init = async () => {
      try {
        const { createChart, CrosshairMode, LineStyle } = await import('lightweight-charts');

        chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 340,
          layout: {
            background: { color: '#1e293b' },
            textColor: '#64748b',
            fontSize: 11,
            fontFamily: "'Space Mono', monospace",
          },
          grid: {
            vertLines: { color: '#334155', style: LineStyle.Dotted },
            horzLines: { color: '#334155', style: LineStyle.Dotted },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed },
            horzLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed },
          },
          rightPriceScale: {
            borderColor: '#334155',
            textColor: '#64748b',
          },
          timeScale: {
            borderColor: '#334155',
            timeVisible: true,
            secondsVisible: false,
          },
        });

        const candleSeries = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderUpColor: '#10b981',
          borderDownColor: '#ef4444',
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        });

        const ema9Series = chart.addLineSeries({
          color: '#0ea5e9',
          lineWidth: 1.5,
          title: 'EMA9',
          priceLineVisible: false,
          lastValueVisible: false,
        });

        const ema21Series = chart.addLineSeries({
          color: '#f97316',
          lineWidth: 1.5,
          title: 'EMA21',
          priceLineVisible: false,
          lastValueVisible: false,
        });

        seriesRef.current = candleSeries;
        ema9Ref.current = ema9Series;
        ema21Ref.current = ema21Series;
        chartRef.current = chart;

        // Resize observer
        const ro = new ResizeObserver(() => {
          if (containerRef.current) {
            chart.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        ro.observe(containerRef.current);

        setChartReady(true);
      } catch (err) {
        console.error('Chart init error:', err);
      }
    };

    init();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // ─── Update candle data ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !seriesRef.current || candles.length === 0) return;

    try {
      // Format candles for lightweight-charts (needs seconds timestamp)
      const formatted = candles
        .filter((c) => c.time && c.open && c.high && c.low && c.close)
        .map((c) => ({
          time: Math.floor(c.time / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        .sort((a, b) => a.time - b.time);

      seriesRef.current.setData(formatted);

      // EMA calculations
      const closes = formatted.map((c) => c.close);
      const ema9Data = computeEMA(closes, 9).map((val, i) => ({
        time: formatted[i + 9 - 1]?.time,
        value: val,
      })).filter((d) => d.time);

      const ema21Data = computeEMA(closes, 21).map((val, i) => ({
        time: formatted[i + 21 - 1]?.time,
        value: val,
      })).filter((d) => d.time);

      if (ema9Ref.current) ema9Ref.current.setData(ema9Data);
      if (ema21Ref.current) ema21Ref.current.setData(ema21Data);

      // Fit to visible
      chartRef.current?.timeScale().fitContent();
    } catch (err) {
      console.error('Chart data error:', err);
    }
  }, [candles, chartReady]);

  // ─── Trade markers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !seriesRef.current) return;

    try {
      const markers = [];

      // Closed trades
      for (const t of trades.slice(0, 20)) {
        if (t.openTime) {
          markers.push({
            time: Math.floor(t.openTime / 1000),
            position: 'belowBar',
            color: '#0ea5e9',
            shape: 'arrowUp',
            text: 'B',
            size: 1,
          });
        }
        if (t.exitTime) {
          markers.push({
            time: Math.floor(t.exitTime / 1000),
            position: 'aboveBar',
            color: t.pnl >= 0 ? '#10b981' : '#ef4444',
            shape: 'arrowDown',
            text: 'S',
            size: 1,
          });
        }
      }

      // Open positions
      for (const pos of openPositions) {
        if (pos.openTime) {
          markers.push({
            time: Math.floor(pos.openTime / 1000),
            position: 'belowBar',
            color: '#f59e0b',
            shape: 'arrowUp',
            text: '▶',
            size: 1,
          });
        }
      }

      markers.sort((a, b) => a.time - b.time);
      seriesRef.current.setMarkers(markers);
    } catch (err) {
      console.error('Marker error:', err);
    }
  }, [trades, openPositions, chartReady]);

  return (
    <div ref={containerRef} className="w-full" style={{ height: 340 }}>
      {!chartReady && (
        <div className="h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// Local EMA for chart
function computeEMA(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(prev);
  for (let i = period; i < values.length; i++) {
    const cur = values[i] * k + prev * (1 - k);
    ema.push(cur);
    prev = cur;
  }
  return ema;
}
