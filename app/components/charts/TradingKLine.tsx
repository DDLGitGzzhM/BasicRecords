'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  type CandlestickData,
  type IChartApi,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts'
import type { MetricPoint } from '@/lib/types'
import type { Timeframe } from '@/lib/sheets'
import { useThemeMode } from '@/components/providers/ThemeProvider'

type Props = {
  data: MetricPoint[]
  compact?: boolean
  timeframe?: Timeframe
  onSelectDate?: (date: string, events?: string[]) => void
}

type Candle = CandlestickData & { raw: MetricPoint }

const toTimestamp = (date: string): UTCTimestamp => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) as UTCTimestamp

export function TradingKLine({ data, compact = false, timeframe = 'day', onSelectDate }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [hoverPoint, setHoverPoint] = useState<MetricPoint | null>(null)
  const { theme } = useThemeMode()

  const palette = useMemo(
    () =>
      theme === 'dark'
        ? {
            text: '#f5f5f5',
            grid: '#2f2f2f',
            rise: '#26a69a',
            fall: '#ef5350',
            bg: 'transparent'
          }
        : {
            text: '#0f172a',
            grid: '#d7d7d7',
            rise: '#089981',
            fall: '#f23645',
            bg: 'transparent'
          },
    [theme]
  )

  const candles: Candle[] = useMemo(
    () =>
      data.map((point) => ({
        time: toTimestamp(point.date),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        raw: point
      })),
    [data]
  )

  const currentDisplay = useMemo(() => {
    const latest = hoverPoint ?? data[data.length - 1]
    if (!latest) return null
    const prev = data[data.length - 2]
    const change = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0
    return { point: latest, change }
  }, [hoverPoint, data])

  useEffect(() => {
    setHoverPoint(null)
  }, [timeframe, data])

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    const container = containerRef.current
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { type: 'solid', color: palette.bg }, textColor: palette.text, fontSize: 11 },
      grid: {
        vertLines: { color: palette.grid, style: 3 },
        horzLines: { color: palette.grid, style: 3 }
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: palette.grid,
        scaleMargins: { top: 0.1, bottom: 0.2 }
      },
      timeScale: {
        borderColor: palette.grid,
        rightOffset: 3,
        barSpacing: timeframe === 'day' ? 9 : timeframe === 'week' ? 12 : 14,
        fixLeftEdge: false
      },
      handleScroll: true,
      handleScale: true
    })

    chartRef.current = chart

    const candleOptions = {
      upColor: palette.rise,
      downColor: palette.fall,
      wickUpColor: palette.rise,
      wickDownColor: palette.fall,
      borderVisible: false
    } as const

    const candleSeries = chart.addSeries(CandlestickSeries, candleOptions)
    candleSeries.setData(candles)
    chart.timeScale().fitContent()

    // Markers for diary events (guard against missing API).
    const markers = candles
      .filter((candle) => (candle.raw.events?.length ?? 0) > 0)
      .map((candle) => ({
        time: candle.time as Time,
        position: 'belowBar' as const,
        color: palette.rise,
        shape: 'circle' as const,
        size: 1,
        text: String(candle.raw.events.length)
      }))
    if (typeof (candleSeries as any).setMarkers === 'function') {
      ;(candleSeries as any).setMarkers(markers)
    }

    const last = candles[candles.length - 1]
    if (last) {
      candleSeries.createPriceLine({
        price: last.close,
        color: last.close >= last.open ? palette.rise : palette.fall,
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true
      })
    }

    const resizeObserver = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container
      chart.applyOptions({ width: clientWidth, height: clientHeight })
    })
    resizeObserver.observe(container)

    const findPoint = (time: Time) =>
      candles.find((candle) => candle.time === time)?.raw ?? null

    const clickHandler = (param: { time?: Time; point?: { x: number; y: number } }) => {
      const time = param.time
      if (!time) return
      const point = findPoint(time)
      if (point && onSelectDate) onSelectDate(point.date, point.events)
    }

    const moveHandler = (param: { time?: Time }) => {
      if (!param.time) {
        setHoverPoint(null)
        return
      }
      const point = findPoint(param.time)
      setHoverPoint(point)
    }

    chart.subscribeClick(clickHandler)
    chart.subscribeCrosshairMove(moveHandler)

    return () => {
      resizeObserver.disconnect()
      chart.unsubscribeClick(clickHandler)
      chart.unsubscribeCrosshairMove(moveHandler)
      chart.remove()
      chartRef.current = null
    }
  }, [candles, onSelectDate, palette, timeframe])

  if (candles.length === 0) {
    return (
      <div className={compact ? 'h-64 w-full' : 'h-80 w-full'}>
        <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-muted)]">暂无 K 线数据</div>
      </div>
    )
  }

  return (
    <div className="relative w-full" style={{ height: compact ? '16rem' : '20rem' }}>
      {currentDisplay && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-black/60 px-3 py-2 text-xs text-white shadow-md backdrop-blur-sm dark:bg-black/50">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{currentDisplay.point.date}</span>
            <span className="text-[11px] text-gray-200">
              O {currentDisplay.point.open.toFixed(2)} · H {currentDisplay.point.high.toFixed(2)} · L{' '}
              {currentDisplay.point.low.toFixed(2)} · C {currentDisplay.point.close.toFixed(2)}
            </span>
            <span
              className={`font-semibold ${currentDisplay.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {currentDisplay.change >= 0 ? '+' : ''}
              {currentDisplay.change.toFixed(2)}%
            </span>
          </div>
          {currentDisplay.point.events.length > 0 && (
            <p className="mt-1 text-[11px] text-gray-300">
              关联日记 {currentDisplay.point.events.length} 条 · 点击蜡烛查看
            </p>
          )}
        </div>
      )}
      <div ref={containerRef} className="h-full w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)]" />
    </div>
  )
}
