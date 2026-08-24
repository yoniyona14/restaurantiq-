'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DrillDownColumn {
  key: string
  label: string
  align?: 'left' | 'right'
}

export interface DrillDownData {
  title: string
  subtitle?: string
  columns: DrillDownColumn[]
  rows: Record<string, string | number>[]
  emptyLabel?: string
}

export default function DrillDownPanel({ data, onClose }: { data: DrillDownData | null; onClose: () => void }) {
  const open = !!data

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 z-40 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-screen w-full sm:w-[440px] bg-white z-50 shadow-2xl transition-transform duration-200 flex flex-col',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {data && (
          <>
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{data.title}</h3>
                {data.subtitle && <p className="text-xs text-gray-400 mt-0.5">{data.subtitle}</p>}
              </div>
              <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {data.rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">{data.emptyLabel ?? 'No records for this selection'}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr>
                      {data.columns.map(c => (
                        <th
                          key={c.key}
                          className={cn(
                            'px-4 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wide',
                            c.align === 'right' ? 'text-right' : 'text-left'
                          )}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {data.columns.map(c => (
                          <td
                            key={c.key}
                            className={cn('px-4 py-2.5 text-gray-700', c.align === 'right' ? 'text-right tabular-nums' : 'text-left')}
                          >
                            {row[c.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
