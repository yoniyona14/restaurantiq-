'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { MenuItem, MenuCategoryRecord, RestaurantTable } from '@/types'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, QrCode, Download, X } from 'lucide-react'
import QRCode from 'qrcode'

export default function MenuManagementPage() {
  const supabase = createClient()
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [restaurant, setRestaurant] = useState<any>(null)
  const [tab, setTab] = useState<'items' | 'qr'>('items')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})

  // Form state
  const [form, setForm] = useState({ name: '', description: '', price: '', category_id: '', is_available: true })

  useEffect(() => { load() }, [])

  // Generate a real, on-screen QR preview for every table whenever the
  // table list or restaurant slug becomes available (previously this just
  // showed a generic placeholder icon and only built the real QR at
  // download time).
  useEffect(() => {
    if (!restaurant?.slug || tables.length === 0) return
    let cancelled = false
    async function genAll() {
      const entries = await Promise.all(
        tables.map(async t => {
          const url = `${window.location.origin}/menu/${restaurant.slug}/${t.table_number}`
          const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 })
          return [t.id, dataUrl] as const
        })
      )
      if (!cancelled) setQrCodes(Object.fromEntries(entries))
    }
    genAll()
    return () => { cancelled = true }
  }, [restaurant?.slug, tables])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('*, restaurants(*)').eq('id', user!.id).single()
    setRestaurant(profile!.restaurants)

    const [{ data: cats }, { data: menuItems }, { data: tbls }] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('restaurant_id', profile!.restaurant_id).order('sort_order'),
      supabase.from('menu_items').select('*, menu_categories(name)').eq('restaurant_id', profile!.restaurant_id).order('name'),
      supabase.from('tables').select('*').eq('restaurant_id', profile!.restaurant_id).order('table_number'),
    ])
    setCategories(cats ?? [])
    setItems((menuItems as any) ?? [])
    setTables(tbls ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', price: '', category_id: categories[0]?.id ?? '', is_available: true })
    setShowModal(true)
  }

  function openEdit(item: MenuItem) {
    setEditing(item)
    setForm({ name: item.name, description: item.description ?? '', price: String(item.price), category_id: item.category_id, is_available: item.is_available })
    setShowModal(true)
  }

  async function saveItem() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()

    const payload = {
      restaurant_id: profile!.restaurant_id,
      category_id: form.category_id,
      name: form.name,
      description: form.description,
      price: Number(form.price),
      is_available: form.is_available,
    }

    if (editing) {
      await supabase.from('menu_items').update(payload).eq('id', editing.id)
      toast.success('Item updated')
    } else {
      await supabase.from('menu_items').insert({ ...payload, sales_count: 0 })
      toast.success('Item added')
    }
    setShowModal(false)
    load()
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this menu item?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    toast.success('Item deleted')
    load()
  }

  async function toggleAvailable(item: MenuItem) {
    await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
    load()
  }

  async function addTable() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    const nextNum = (tables[tables.length - 1]?.table_number ?? 0) + 1
    await supabase.from('tables').insert({ restaurant_id: profile!.restaurant_id, table_number: nextNum, status: 'available' })
    toast.success(`Table ${nextNum} added`)
    load()
  }

  async function downloadQR(table: RestaurantTable) {
    const url = `${window.location.origin}/menu/${restaurant.slug}/${table.table_number}`
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `table-${table.table_number}-qr.png`
    link.click()
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Menu Management</h1>
          <p className="text-sm text-gray-500">Manage items, categories, and QR table menus</p>
        </div>
        {tab === 'items' && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Add item
          </button>
        )}
        {tab === 'qr' && (
          <button onClick={addTable} className="btn-primary">
            <Plus className="w-4 h-4" /> Add table
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('items')} className={cn('px-4 py-1.5 rounded-md text-sm font-medium', tab === 'items' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
          Menu items
        </button>
        <button onClick={() => setTab('qr')} className={cn('px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5', tab === 'qr' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
          <QrCode className="w-3.5 h-3.5" /> QR codes
        </button>
      </div>

      {tab === 'items' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400">{(item.category as any)?.name}</p>
                </div>
                <span className={cn('badge', item.is_available ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                  {item.is_available ? 'Available' : 'Hidden'}
                </span>
              </div>
              {item.description && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{item.description}</p>}
              <div className="flex items-center justify-between mt-3">
                <p className="font-semibold text-brand-600">{formatCurrency(item.price)}</p>
                <p className="text-xs text-gray-400">{item.sales_count} sold</p>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => openEdit(item)} className="btn-secondary flex-1 text-xs py-1.5">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button onClick={() => toggleAvailable(item)} className="btn-secondary flex-1 text-xs py-1.5">
                  {item.is_available ? 'Hide' : 'Show'}
                </button>
                <button onClick={() => deleteItem(item.id)} className="btn-secondary text-xs py-1.5 px-2.5 text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center py-12">No menu items yet. Click "Add item" to get started.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map(table => (
            <div key={table.id} className="card p-4 text-center">
              <p className="font-medium text-gray-900 mb-2">Table {table.table_number}</p>
              <div className="bg-gray-50 rounded-lg p-3 mb-3 flex items-center justify-center aspect-square">
                {qrCodes[table.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrCodes[table.id]} alt={`QR code for table ${table.table_number}`} className="w-full h-full object-contain" />
                ) : (
                  <QrCode className="w-16 h-16 text-gray-300 animate-pulse" />
                )}
              </div>
              <div className="flex gap-2">
                <a
                  href={`/menu/${restaurant?.slug}/${table.table_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex-1 text-xs py-1.5"
                >
                  Preview
                </a>
                <button onClick={() => downloadQR(table)} className="btn-secondary flex-1 text-xs py-1.5">
                  <Download className="w-3 h-3" /> Download
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 truncate">/menu/{restaurant?.slug}/{table.table_number}</p>
            </div>
          ))}
          {tables.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center py-12">No tables yet. Click "Add table" to generate your first QR code.</p>}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit item' : 'Add menu item'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Beef Tibs" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price (ETB)</label>
                  <input type="number" className="input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={form.is_available} onChange={e => setForm({ ...form, is_available: e.target.checked })} />
                Available on menu
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={saveItem} className="btn-primary flex-1">{editing ? 'Save changes' : 'Add item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
