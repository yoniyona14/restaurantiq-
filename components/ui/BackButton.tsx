'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BackButtonProps {
  /** Optional explicit destination. If omitted, falls back to browser history. */
  href?: string
  label?: string
  className?: string
}

export default function BackButton({ href, label = 'Back', className }: BackButtonProps) {
  const router = useRouter()

  function handleClick() {
    if (href) router.push(href)
    else router.back()
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors',
        className
      )}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  )
}
