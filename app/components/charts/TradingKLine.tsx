'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { CandlestickChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { MetricPoint } from '@/lib/types'
import { useThemeMode } from '@/components/providers/ThemeProvider'

echarts.use([CandlestickChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer])

type Props = {
  data: MetricPoint[]
  compact?: boolean
  onSelectDate?: (date: string, events?: string[]) => void
}

export function TradingKLine({ data, compact = false, onSelectDate }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { theme } = useThemeMode()

  const palette = useMemo(
    () =>
      theme === 'dark'
        ? {
            text: '#dcdcdc',
            grid: '#303030',
            rise: '#2ecc71',
            fall: '#ff5c8d',
            background: 'transparent'
          }
        : {
            text: '#1a1a1a',
            grid: '#e1e1e1',
            rise: '#0b8f55',
            fall: '#c0392b',
            background: 'transparent'
          },
    [theme]
  )

  useEffect(() => {
    if (!ref.current) return

    const chart = echarts.init(ref.current)
    chart.setOption({
      backgroundColor: palette.background,
      textStyle: { color: palette.text },
      animation: true,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      grid: { left: compact ? 30 : 40, right: 16, top: 10, bottom: compact ? 10 : 30 },
      xAxis: {
        type: 'category',
        data: data.map((point) => point.date),
        boundaryGap: true,
        axisLine: { lineStyle: { color: palette.grid } },
        axisTick: { show: false },
        axisLabel: {
          color: palette.text,
          fontSize: 10,
          interval: 0,
          formatter: (value: string) => value.slice(5, 10)
        }
      },
      yAxis: {
        scale: true,
        axisLine: { lineStyle: { color: palette.grid } },
        splitLine: { lineStyle: { color: palette.grid, opacity: 0.3 } },
        axisLabel: { color: palette.text, fontSize: 10 }
      },
      dataZoom: compact
        ? []
        : [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', start: 50, end: 100, height: 16 }
          ],
      series: [
        {
          type: 'candlestick',
          barWidth: compact ? '60%' : '55%',
          barCategoryGap: '5%',
          itemStyle: {
            color: palette.rise,
            color0: palette.fall,
            borderColor: palette.rise,
            borderColor0: palette.fall
          },
          data: data.map((point) => [point.open, point.close, point.low, point.high])
        }
      ]
    })

    const handleResize = () => {
      chart.resize()
    }
    window.addEventListener('resize', handleResize)

    if (onSelectDate) {
      const handler = (params: any) => {
        if (params.componentType === 'series') {
          const point = data[params.dataIndex]
          if (point) {
            onSelectDate(point.date, point.events)
          }
        }
      }
      chart.on('click', handler)
      return () => {
        window.removeEventListener('resize', handleResize)
        chart.off('click', handler)
        chart.dispose()
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [compact, data, onSelectDate, palette])

  return <div ref={ref} className={compact ? 'h-64 w-full' : 'h-80 w-full'} />
}
