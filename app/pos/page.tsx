'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatCurrency, calculateOrderTotals, PAYMENT_LABELS } from '@/lib/utils'
import { MenuItem, CartItem, PaymentMethod, RestaurantTable } from '@/types'
import toast from 'react-hot-toast'
import { Search, Plus, Minus, Trash2, Receipt, ChevronDown } from 'lucide-react'
import StandaloneTopBar from '@/components/ui/StandaloneTopBar'

const CATEGORIES = ['All', 'Food', 'Drinks', 'Desserts', 'Specials']
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'telebirr', 'cbe_birr', 'bank_transfer']

export default function POSPage() {
  const supabase = createClient()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [discount, setDiscount] = useState(0)
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [heldOrders, setHeldOrders] = useState<{ id: string; cart: CartItem[]; table: string; discount: number; createdAt: number }[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('*').eq('id', user!.id).single()
      setUser(profile)

      const [{ data: items }, { data: tbls }] = await Promise.all([
        supabase.from('menu_items').select('*, menu_categories(name)').eq('restaurant_id', profile.restaurant_id).eq('is_available', true).order('name'),
        supabase.from('tables').select('*').eq('restaurant_id', profile.restaurant_id).order('table_number'),
      ])
      setMenuItems(items ?? [])
      setTables(tbls ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const filtered = menuItems.filter(item => {
    const matchCat = category === 'All' || (item.category as any)?.name === category
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const subtotal = cart.reduce((s, i) => s + i.menu_item.price * i.quantity, 0)
  const { tax, total } = calculateOrderTotals(subtotal, discount)

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(i => i.menu_item.id === item.id)
      if (existing) return prev.map(i => i.menu_item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { menu_item: item, quantity: 1 }]
    })
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => prev
      .map(i => i.menu_item.id === id ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0)
    )
  }

  function clearCart() { setCart([]); setDiscount(0); setSelectedTable('') }

  function holdOrder() {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    setHeldOrders(prev => [...prev, { id: crypto.randomUUID(), cart, table: selectedTable, discount, createdAt: Date.now() }])
    clearCart()
    toast.success('Order held')
  }

  function resumeOrder(id: string) {
    const held = heldOrders.find(h => h.id === id)
    if (!held) return
    if (cart.length > 0 && !confirm('This will replace your current cart. Continue?')) return
    setCart(held.cart)
    setSelectedTable(held.table)
    setDiscount(held.discount)
    setHeldOrders(prev => prev.filter(h => h.id !== id))
  }

  function discardHeldOrder(id: string) {
    if (!confirm('Discard this held order?')) return
    setHeldOrders(prev => prev.filter(h => h.id !== id))
  }

  async function processOrder() {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    setProcessing(true)

    const { data: order, error } = await supabase.from('orders').insert({
      restaurant_id: user.restaurant_id,
      cashier_id: user.id,
      table_id: selectedTable || null,
      status: 'pending',
      subtotal,
      tax,
      discount,
      total,
      notes: '',
    }).select().single()

    if (error || !order) { toast.error(`Failed to create order: ${error?.message ?? 'unknown error'}`); setProcessing(false); return }

    const { error: itemsError } = await supabase.from('order_items').insert(
      cart.map(i => ({
        order_id: order.id,
        menu_item_id: i.menu_item.id,
        quantity: i.quantity,
        unit_price: i.menu_item.price,
        subtotal: i.menu_item.price * i.quantity,
      }))
    )
    if (itemsError) {
      toast.error(`Order created but items failed to save: ${itemsError.message}. Please check Orders.`)
      setProcessing(false)
      return
    }

    const { error: paymentError } = await supabase.from('payments').insert({
      order_id: order.id,
      method: paymentMethod,
      amount: total,
      paid_at: new Date().toISOString(),
    })
    if (paymentError) {
      toast.error(`Order saved but payment record failed: ${paymentError.message}`)
    }

    // Increment sales counts (best-effort; doesn't block order completion)
    for (const item of cart) {
      await supabase.from('menu_items').update({ sales_count: item.menu_item.sales_count + item.quantity }).eq('id', item.menu_item.id)
    }

    toast.success(`Order #${order.id.slice(-4).toUpperCase()} created!`)
    clearCart()
    setProcessing(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading POS…</div>

  return (
    <div className="p-6 min-h-screen">
      <StandaloneTopBar
        title="Point of Sale"
        subtitle="Tap items to add them to the order"
        backHref={user?.role === 'cashier' ? null : '/dashboard'}
        right={heldOrders.length > 0 && (
          <div className="relative group">
            <button className="btn-secondary text-xs py-1.5 px-3">
              Held orders ({heldOrders.length})
            </button>
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1 hidden group-hover:block z-20">
              {heldOrders.map(h => (
                <div key={h.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 text-xs">
                  <button onClick={() => resumeOrder(h.id)} className="text-left flex-1 text-gray-700">
                    {h.cart.length} item{h.cart.length !== 1 ? 's' : ''} · {formatCurrency(h.cart.reduce((s, i) => s + i.menu_item.price * i.quantity, 0))}
                  </button>
                  <button onClick={() => discardHeldOrder(h.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      />
      <div className="flex gap-4 h-[calc(100vh-180px)]">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Search + filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Search menu items…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  category === cat ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
          {filtered.map(item => {
            const inCart = cart.find(i => i.menu_item.id === item.id)
            return (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className={cn(
                  'card card-hover p-4 text-left transition-all active:scale-95',
                  inCart && 'ring-2 ring-brand-500 ring-offset-1'
                )}
              >
                <div className="text-2xl mb-2">🍽️</div>
                <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(item.category as any)?.name}</p>
                <p className="text-sm font-semibold text-brand-600 mt-2">{formatCurrency(item.price)}</p>
                {inCart && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-brand-600 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {inCart.quantity}
                  </span>
                )}
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-full flex items-center justify-center h-32 text-gray-400 text-sm">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 flex flex-col bg-white border border-gray-100 rounded-xl shadow-sm">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Current Order</h2>
          <select
            value={selectedTable}
            onChange={e => setSelectedTable(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">No table</option>
            {tables.map(t => <option key={t.id} value={t.id}>Table {t.table_number}</option>)}
          </select>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
              <Receipt className="w-8 h-8" />
              <p className="text-sm">Add items to start an order</p>
            </div>
          )}
          {cart.map(item => (
            <div key={item.menu_item.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{item.menu_item.name}</p>
                <p className="text-xs text-gray-400">{formatCurrency(item.menu_item.price)} each</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(item.menu_item.id, -1)} className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                <button onClick={() => updateQty(item.menu_item.id, 1)} className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <Plus className="w-3 h-3" />
                </button>
                <button onClick={() => updateQty(item.menu_item.id, -item.quantity)} className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors ml-1">
                  <Trash2 className="w-3 h-3 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals + Payment */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          {/* Discount */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20">Discount</label>
            <input
              type="number" min={0} max={subtotal}
              value={discount}
              onChange={e => setDiscount(Math.min(Number(e.target.value), subtotal))}
              className="input text-xs py-1.5 text-right"
            />
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-xs text-red-500">
                <span>Discount</span><span>- {formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-500">
              <span>Tax (15% VAT)</span><span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200">
              <span>Total</span><span>{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-1.5">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={cn(
                  'py-2 px-3 rounded-lg text-xs font-medium border transition-all',
                  paymentMethod === m
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                )}
              >
                {PAYMENT_LABELS[m]}
              </button>
            ))}
          </div>

          <button
            onClick={processOrder}
            disabled={processing || cart.length === 0}
            className="btn-primary w-full py-3 text-sm"
          >
            {processing ? 'Processing…' : `Charge ${formatCurrency(total)}`}
          </button>
          {cart.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={holdOrder} className="btn-secondary w-full text-xs py-2">
                Hold order
              </button>
              <button onClick={clearCart} className="btn-secondary w-full text-xs py-2">
                Clear order
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
