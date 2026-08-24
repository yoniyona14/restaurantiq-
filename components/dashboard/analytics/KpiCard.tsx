'use client'

import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function KpiCard({
  label,
  value,
  deltaPct,
  invertGood = false,
  subtext,
}: {
  label: string
  value: string
  deltaPct: number | null
  /** If true, a negative delta is "good" (e.g. food cost %, waste) and shown green */
  invertGood?: boolean
  subtext?: string
}) {
  const isFlat = deltaPct === null || Math.abs(deltaPct) < 0.5
  const isUp = (deltaPct ?? 0) > 0
  const good = isFlat ? null : invertGood ? !isUp : isUp

  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <p className="text-xl font-semibold text-gray-900 tabular-nums">{value}</p>
      <div className="flex items-center gap-1 mt-1.5">
        {isFlat ? (
          <Minus className="w-3 h-3 text-gray-300" />
        ) : isUp ? (
          <ArrowUp className={cn('w-3 h-3', good ? 'text-green-500' : 'text-red-500')} />
        ) : (
          <ArrowDown className={cn('w-3 h-3', good ? 'text-green-500' : 'text-red-500')} />
        )}
        <span
          className={cn(
            'text-xs font-medium tabular-nums',
            isFlat ? 'text-gray-400' : good ? 'text-green-600' : 'text-red-600'
          )}
        >
          {isFlat ? 'flat' : `${Math.abs(deltaPct!)}%`}
        </span>
        <span className="text-xs text-gray-400">vs prior period</span>
      </div>
      {subtext && <p className="text-[11px] text-gray-400 mt-1">{subtext}</p>}
    </div>
  )
}
