'use client'

import { useState } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { Search, UtensilsCrossed } from 'lucide-react'

interface Props {
  restaurant: any
  categories: any[]
  items: any[]
  tableNumber: string
}

export default function MenuClient({ restaurant, categories, items, tableNumber }: Props) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = items.filter(item => {
    const matchCat = activeCategory === 'all' || item.category_id === activeCategory
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{restaurant.name}</h1>
              <p className="text-xs text-gray-400">Table {tableNumber} · Digital menu</p>
            </div>
            <div className="w-10 h-10 bg-brand-50 rounded-full flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5 text-brand-600" />
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search the menu…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn('px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              activeCategory === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600')}
          >
            All items
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn('px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                activeCategory === cat.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600')}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu items */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {filtered.map(item => (
          <div key={item.id} className="card p-4 flex gap-4">
          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                '🍽️'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-gray-900">{item.name}</h3>
                <span className="font-semibold text-brand-600 whitespace-nowrap">{formatCurrency(item.price)}</span>
              </div>
              {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No items found</p>
          </div>
        )}
      </div>

      <div className="text-center py-6">
        <p className="text-xs text-gray-300">Powered by RestaurantIQ</p>
      </div>
    </div>
  )
}
