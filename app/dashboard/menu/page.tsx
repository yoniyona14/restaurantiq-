'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { MenuItem, MenuCategoryRecord, RestaurantTable } from '@/types'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, QrCode, Download, X, ImagePlus, Loader2 } from 'lucide-react'
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
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category_id: '',
    is_available: true,
    image_url: '',
  })
  const [uploading, setUploading] = useState(false)

  useEffect(() => { load() }, [])

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
    const { data: profile } = await supabase
      .from('users')
      .select('*, restaurants(*)')
      .eq('id', user!.id)
      .single()
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
    setForm({ name: '', description: '', price: '', category_id: categories[0]?.id ?? '', is_available: true, image_url: '' })
    setShowModal(true)
  }

  function openEdit(item: MenuItem) {
    setEditing(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      category_id: item.category_id,
      is_available: item.is_available,
      image_url: item.image_url ?? '',
    })
    setShowModal(true)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
      const ext = file.name.split('.').pop()
      const path = `${profile!.restaurant_id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true })
      if (uploadError) { toast.error(`Upload failed: ${uploadError.message}`); return }
      const { data: publicUrl } = supabase.storage.from('menu-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl.publicUrl }))
      toast.success('Image uploaded')
    } finally {
      setUploading(false)
    }
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
      image_url: form.image_url || null,
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

      {/* Header */}
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
        <button
          onClick={() => setTab('items')}
          className={cn('px-4 py-1.5 rounded-md text-sm font-medium', tab === 'items' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}
        >
          Menu items
        </button>
        <button
          onClick={() => setTab('qr')}
          className={cn('px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5', tab === 'qr' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}
        >
          <QrCode className="w-3.5 h-3.5" /> QR codes
        </button>
      </div>

      {/* Items tab */}
      {tab === 'items' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="card p-4">
              {item.image_url && (
                <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover rounded-lg mb-3" />
              )}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400">{(item.category as any)?.name}</p>
                </div>
                <span className={cn('badge', item.is_available ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                  {item.is_available ? 'Available' : 'Hidden'}
                </span>
              </div>
              {item.description && (
                <p className="text-sm text-gray-500 mb-2 line-clamp-2">{item.description}</p>
              )}
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
          {items.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full text-center py-12">No menu items yet. Click "Add item" to get started.</p>
          )}
        </div>
      )}

      {/* QR tab */}
      {tab === 'qr' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map(table => (
            <div key={table.id} className="card p-4 text-center">
              <p className="font-medium text-gray-900 mb-2">Table {table.table_number}</p>
              <div className="bg-gray-50 rounded-lg p-3 mb-3 flex items-center justify-center aspect-square">
                {qrCodes[table.id] ? (
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
          {tables.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full text-center py-12">No tables yet. Click "Add table" to generate your first QR code.</p>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit item' : 'Add menu item'}</h2>
              <button onClick={() => setShowModal(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">

              {/* Photo */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {uploading ? (
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                    ) : form.image_url ? (
                      <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus className="w-5 h-5 text-gray-300" />
                    )}
                  </div>
                  <label className="btn-secondary text-xs py-1.5 cursor-pointer">
                    {form.image_url ? 'Change photo' : 'Upload photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                  {form.image_url && (
                    <button type="button" onClick={() => setForm({ ...form, image_url: '' })} className="text-xs text-red-500 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Beef Tibs" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
              </div>

              {/* Price + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price (ETB)</label>
                  <input type="number" className="input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Available */}
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
