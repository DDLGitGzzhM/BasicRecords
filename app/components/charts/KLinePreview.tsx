'use client'

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { CandlestickChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DatasetComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { MetricPoint } from '@/lib/types'

echarts.use([CandlestickChart, GridComponent, TooltipComponent, DatasetComponent, LegendComponent, CanvasRenderer])

export function KLinePreview({ data }: { data: MetricPoint[] }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current || data.length === 0) return

    const chart = echarts.init(ref.current)
    chart.setOption({
      backgroundColor: 'transparent',
      textStyle: { color: '#ddd' },
      tooltip: { trigger: 'axis' },
      grid: { left: 0, right: 0, bottom: 0, top: 20, containLabel: true },
      dataset: {
        source: data.map((point) => [point.date, point.open, point.close, point.low, point.high])
      },
      xAxis: {
        type: 'category',
        boundaryGap: true,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } }
      },
      yAxis: {
        scale: true,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } }
      },
      series: [
        {
          type: 'candlestick',
          encode: { x: 0, y: [1, 2, 3, 4] },
          itemStyle: {
            color: '#20e3b2',
            color0: '#ef4444',
            borderColor: '#20e3b2',
            borderColor0: '#ef4444'
          }
        }
      ]
    })

    return () => {
      chart.dispose()
    }
  }, [data])

  return <div ref={ref} className="h-72 w-full" />
}
