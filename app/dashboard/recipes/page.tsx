'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { InventoryItem, MenuItem, MenuCategoryRecord } from '@/types'
import { RecipeVersion, RecipeIngredient, RecipeInstruction } from '@/types/enterprise'
import toast from 'react-hot-toast'
import { Plus, X, ChefHat, DollarSign, TrendingUp, Pencil, AlertCircle, Check } from 'lucide-react'

const ALLERGENS = ['Milk', 'Eggs', 'Nuts', 'Gluten', 'Soy', 'Fish', 'Shellfish', 'Sesame']
const DIFFICULTIES = ['easy', 'medium', 'hard']

export default function RecipesPage() {
  const supabase = createClient()
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [recipeVersions, setRecipeVersions] = useState<Record<string, RecipeVersion>>({})
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState('')
  const [userId, setUserId] = useState('')
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'ingredients' | 'instructions' | 'allergens'>('details')
  const [saving, setSaving] = useState(false)

  // Recipe form
  const [form, setForm] = useState({
    prep_time: '', cook_time: '', portion_size: '', portion_unit: 'g',
    difficulty: 'medium', notes: '', allergens: [] as string[]
  })
  const [ingredients, setIngredients] = useState<Partial<RecipeIngredient>[]>([])
  const [instructions, setInstructions] = useState<Partial<RecipeInstruction>[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    setRestaurantId(profile!.restaurant_id)
    setUserId(user!.id)

    const [{ data: menuItems }, { data: cats }, { data: inv }] = await Promise.all([
      supabase.from('menu_items').select('*, menu_categories(name)').eq('restaurant_id', profile!.restaurant_id).order('name'),
      supabase.from('menu_categories').select('*').eq('restaurant_id', profile!.restaurant_id),
      supabase.from('inventory_items').select('*').eq('restaurant_id', profile!.restaurant_id).order('name'),
    ])

    setItems((menuItems as any) ?? [])
    setCategories(cats ?? [])
    setInventory(inv ?? [])

    // Load current recipe versions for all items
    if (menuItems && menuItems.length > 0) {
      const { data: versions } = await supabase
        .from('recipe_versions')
        .select('*, recipe_ingredients(*, inventory_items(name, unit, unit_cost)), recipe_instructions(*)')
        .in('menu_item_id', menuItems.map(m => m.id))
        .eq('is_current', true)

      const versionMap: Record<string, RecipeVersion> = {}
      versions?.forEach(v => { versionMap[v.menu_item_id] = v })
      setRecipeVersions(versionMap)
    }

    setLoading(false)
  }

  function openRecipe(item: MenuItem) {
    setSelected(item)
    const existing = recipeVersions[item.id]
    setForm({
      prep_time: String((item as any).prep_time ?? ''),
      cook_time: String((item as any).cook_time ?? ''),
      portion_size: String((item as any).portion_size ?? ''),
      portion_unit: (item as any).portion_unit ?? 'g',
      difficulty: (item as any).difficulty ?? 'medium',
      notes: (item as any).notes ?? '',
      allergens: (item as any).allergens ?? [],
    })
    setIngredients(existing?.ingredients?.map(i => ({
      inventory_id: (i as any).inventory_id,
      ingredient_name: i.ingredient_name,
      quantity: i.quantity,
      unit: i.unit,
      prep_notes: i.prep_notes ?? '',
      is_optional: i.is_optional,
      waste_percentage: i.waste_percentage,
      yield_percentage: i.yield_percentage,
    })) ?? [{ ingredient_name: '', quantity: 0, unit: 'g', is_optional: false, waste_percentage: 0, yield_percentage: 100 }])
    setInstructions(existing?.instructions?.sort((a, b) => a.step_number - b.step_number).map(i => ({
      step_number: i.step_number,
      title: i.title,
      description: i.description,
      duration_minutes: i.duration_minutes,
    })) ?? [{ step_number: 1, title: '', description: '', duration_minutes: 0 }])
    setActiveTab('details')
    setShowModal(true)
  }

  function addIngredient() {
    setIngredients([...ingredients, { ingredient_name: '', quantity: 0, unit: 'g', is_optional: false, waste_percentage: 0, yield_percentage: 100 }])
  }

  function updateIngredient(i: number, field: string, value: any) {
    const updated = [...ingredients]
    updated[i] = { ...updated[i], [field]: value }
    if (field === 'inventory_id') {
      const inv = inventory.find(item => item.id === value)
      if (inv) {
        updated[i].ingredient_name = inv.name
        updated[i].unit = inv.unit
      }
    }
    setIngredients(updated)
  }

  function addInstruction() {
    setInstructions([...instructions, { step_number: instructions.length + 1, title: '', description: '', duration_minutes: 0 }])
  }

  function toggleAllergen(a: string) {
    setForm(f => ({
      ...f,
      allergens: f.allergens.includes(a) ? f.allergens.filter(x => x !== a) : [...f.allergens, a]
    }))
  }

  // Calculate costs
  function calcCosts() {
    let totalCost = 0
    ingredients.forEach(ing => {
      if (!ing.inventory_id) return
      const inv = inventory.find(i => i.id === ing.inventory_id)
      if (!inv) return
      const waste = (ing.waste_percentage ?? 0) / 100
      const yieldFactor = (ing.yield_percentage ?? 100) / 100
      const effectiveQty = (Number(ing.quantity) * (1 + waste)) / yieldFactor
      totalCost += effectiveQty * inv.unit_cost
    })
    const sellingPrice = selected?.price ?? 0
    const grossProfit = sellingPrice - totalCost
    const profitMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0
    const foodCostPct = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0
    return { totalCost, grossProfit, profitMargin, foodCostPct }
  }

  async function saveRecipe() {
    if (!selected) return
    setSaving(true)
    try {
      // Update menu item basic fields
      await supabase.from('menu_items').update({
        prep_time: Number(form.prep_time) || 0,
        cook_time: Number(form.cook_time) || 0,
        portion_size: Number(form.portion_size) || null,
        portion_unit: form.portion_unit,
        difficulty: form.difficulty,
        notes: form.notes || null,
        allergens: form.allergens,
      }).eq('id', selected.id)

      // Deprecate existing current version
      await supabase.from('recipe_versions').update({ is_current: false }).eq('menu_item_id', selected.id).eq('is_current', true)

      // Get new version number
      const { count } = await supabase.from('recipe_versions').select('*', { count: 'exact', head: true }).eq('menu_item_id', selected.id)
      const newVersion = (count ?? 0) + 1

      // Create new version
      const { data: version, error: vErr } = await supabase.from('recipe_versions').insert({
        menu_item_id: selected.id,
        version_number: newVersion,
        selling_price: selected.price,
        created_by: userId,
        is_current: true,
      }).select().single()

      if (vErr || !version) { toast.error('Failed to create recipe version'); return }

      // Insert ingredients
      if (ingredients.filter(i => i.ingredient_name).length > 0) {
        await supabase.from('recipe_ingredients').insert(
          ingredients
            .filter(i => i.ingredient_name)
            .map(i => ({
              recipe_version_id: version.id,
              inventory_id: i.inventory_id || null,
              ingredient_name: i.ingredient_name,
              quantity: Number(i.quantity),
              unit: i.unit,
              prep_notes: i.prep_notes || null,
              is_optional: i.is_optional ?? false,
              waste_percentage: Number(i.waste_percentage) || 0,
              yield_percentage: Number(i.yield_percentage) || 100,
            }))
        )
      }

      // Insert instructions
      if (instructions.filter(i => i.title).length > 0) {
        await supabase.from('recipe_instructions').insert(
          instructions
            .filter(i => i.title)
            .map((i, idx) => ({
              recipe_version_id: version.id,
              step_number: idx + 1,
              title: i.title,
              description: i.description,
              duration_minutes: Number(i.duration_minutes) || null,
            }))
        )
      }

      // Update current_version on menu_item
      await supabase.from('menu_items').update({ current_version: newVersion }).eq('id', selected.id)

      toast.success(`Recipe v${newVersion} saved`)
      setShowModal(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const costs = selected ? calcCosts() : null

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading recipes…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Recipe Management</h1>
        <p className="text-sm text-gray-500">Cost-engineered recipes with full ingredient traceability</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <span className="kpi-label">Total menu items</span>
          <p className="kpi-value">{items.length}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Recipes built</span>
          <p className="kpi-value">{Object.keys(recipeVersions).length}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Missing recipes</span>
          <p className={cn('kpi-value', items.length - Object.keys(recipeVersions).length > 0 && 'text-amber-600')}>
            {items.length - Object.keys(recipeVersions).length}
          </p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Avg food cost %</span>
          <p className="kpi-value">
            {Object.keys(recipeVersions).length > 0 ? (() => {
              const costs = Object.values(recipeVersions).map(v => {
                const item = items.find(i => i.id === v.menu_item_id)
                if (!item || !item.price) return 0
                const cost = (v.ingredients ?? []).reduce((s, ing) => {
                  const inv = inventory.find(i => i.id === (ing as any).inventory_id)
                  if (!inv) return s
                  const waste = (ing.waste_percentage ?? 0) / 100
                  const yld = (ing.yield_percentage ?? 100) / 100
                  return s + ((Number(ing.quantity) * (1 + waste)) / yld) * inv.unit_cost
                }, 0)
                return (cost / item.price) * 100
              }).filter(c => c > 0)
              return costs.length > 0 ? `${(costs.reduce((s, c) => s + c, 0) / costs.length).toFixed(1)}%` : '—'
            })() : '—'}
          </p>
        </div>
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => {
          const version = recipeVersions[item.id]
          const hasRecipe = !!version

          // Calculate cost for this item
          let foodCostPct = 0
          let recipeCost = 0
          if (version?.ingredients) {
            version.ingredients.forEach(ing => {
              const inv = inventory.find(i => i.id === (ing as any).inventory_id)
              if (!inv) return
              const waste = (ing.waste_percentage ?? 0) / 100
              const yld = (ing.yield_percentage ?? 100) / 100
              recipeCost += ((Number(ing.quantity) * (1 + waste)) / yld) * inv.unit_cost
            })
            foodCostPct = item.price > 0 ? (recipeCost / item.price) * 100 : 0
          }

          return (
            <div key={item.id} className="card p-4">
              {item.image_url && (
                <img src={item.image_url} alt={item.name} className="w-full h-24 object-cover rounded-lg mb-3" />
              )}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400">{(item.category as any)?.name ?? '—'}</p>
                </div>
                {hasRecipe ? (
                  <span className="badge bg-emerald-100 text-emerald-700"><Check className="w-3 h-3" /> v{version.version_number}</span>
                ) : (
                  <span className="badge bg-amber-100 text-amber-700"><AlertCircle className="w-3 h-3" /> No recipe</span>
                )}
              </div>

              {hasRecipe && (
                <div className="grid grid-cols-3 gap-2 my-3">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-400">Cost</p>
                    <p className="text-xs font-semibold text-gray-900">{formatCurrency(recipeCost)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-400">Price</p>
                    <p className="text-xs font-semibold text-brand-600">{formatCurrency(item.price)}</p>
                  </div>
                  <div className={cn('rounded-lg p-2 text-center', foodCostPct > 35 ? 'bg-red-50' : foodCostPct > 25 ? 'bg-amber-50' : 'bg-emerald-50')}>
                    <p className="text-xs text-gray-400">FC%</p>
                    <p className={cn('text-xs font-semibold', foodCostPct > 35 ? 'text-red-600' : foodCostPct > 25 ? 'text-amber-600' : 'text-emerald-600')}>
                      {foodCostPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}

              <button onClick={() => openRecipe(item)} className="btn-secondary w-full text-xs py-1.5 mt-2">
                <ChefHat className="w-3 h-3" /> {hasRecipe ? 'Edit recipe' : 'Build recipe'}
              </button>
            </div>
          )
        })}
        {items.length === 0 && (
          <p className="text-sm text-gray-400 col-span-full text-center py-12">No menu items. Add items in Menu Management first.</p>
        )}
      </div>

      {/* Recipe Modal */}
      {showModal && selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                <p className="text-xs text-gray-400">Recipe editor · Saving creates a new version</p>
              </div>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              {(['details', 'ingredients', 'instructions', 'allergens'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={cn('px-4 py-3 text-sm font-medium capitalize border-b-2 -mb-px',
                    activeTab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* Details tab */}
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Prep time (min)</label>
                      <input type="number" className="input" value={form.prep_time} onChange={e => setForm({ ...form, prep_time: e.target.value })} placeholder="15" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Cook time (min)</label>
                      <input type="number" className="input" value={form.cook_time} onChange={e => setForm({ ...form, cook_time: e.target.value })} placeholder="20" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Portion size</label>
                      <input type="number" className="input" value={form.portion_size} onChange={e => setForm({ ...form, portion_size: e.target.value })} placeholder="250" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Portion unit</label>
                      <select className="input" value={form.portion_unit} onChange={e => setForm({ ...form, portion_unit: e.target.value })}>
                        <option value="g">grams</option>
                        <option value="ml">ml</option>
                        <option value="pcs">pieces</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
                    <div className="flex gap-2">
                      {DIFFICULTIES.map(d => (
                        <button
                          key={d}
                          onClick={() => setForm({ ...form, difficulty: d })}
                          className={cn('flex-1 py-2 rounded-lg text-sm font-medium capitalize border',
                            form.difficulty === d ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Chef notes</label>
                    <textarea className="input" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Plating tips, storage, quality standards…" />
                  </div>
                </div>
              )}

              {/* Ingredients tab */}
              {activeTab === 'ingredients' && (
                <div className="space-y-3">
                  {/* Cost summary */}
                  {costs && (
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Ingredient cost</p>
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(costs.totalCost)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Selling price</p>
                        <p className="text-sm font-semibold text-brand-600">{formatCurrency(selected.price)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Gross profit</p>
                        <p className={cn('text-sm font-semibold', costs.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>{formatCurrency(costs.grossProfit)}</p>
                      </div>
                      <div className={cn('rounded-lg p-3 text-center', costs.foodCostPct > 35 ? 'bg-red-50' : costs.foodCostPct > 25 ? 'bg-amber-50' : 'bg-emerald-50')}>
                        <p className="text-xs text-gray-400">Food cost %</p>
                        <p className={cn('text-sm font-semibold', costs.foodCostPct > 35 ? 'text-red-600' : costs.foodCostPct > 25 ? 'text-amber-600' : 'text-emerald-600')}>
                          {costs.foodCostPct.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  )}

                  {ingredients.map((ing, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-4">
                          <label className="block text-xs text-gray-400 mb-1">Inventory item</label>
                          <select className="input text-xs py-1.5" value={ing.inventory_id ?? ''} onChange={e => updateIngredient(i, 'inventory_id', e.target.value)}>
                            <option value="">— Custom —</option>
                            {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-400 mb-1">Name</label>
                          <input className="input text-xs py-1.5" value={ing.ingredient_name ?? ''} onChange={e => updateIngredient(i, 'ingredient_name', e.target.value)} placeholder="Ingredient" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                          <input type="number" className="input text-xs py-1.5" value={ing.quantity || ''} onChange={e => updateIngredient(i, 'quantity', e.target.value)} placeholder="0" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">Unit</label>
                          <input className="input text-xs py-1.5" value={ing.unit ?? 'g'} onChange={e => updateIngredient(i, 'unit', e.target.value)} />
                        </div>
                        <div className="col-span-1 flex items-end">
                          <button onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 pb-1.5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Waste %</label>
                          <input type="number" className="input text-xs py-1.5" value={ing.waste_percentage ?? 0} onChange={e => updateIngredient(i, 'waste_percentage', e.target.value)} min="0" max="100" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Yield %</label>
                          <input type="number" className="input text-xs py-1.5" value={ing.yield_percentage ?? 100} onChange={e => updateIngredient(i, 'yield_percentage', e.target.value)} min="1" max="100" />
                        </div>
                        <div className="flex items-center gap-2 pt-4">
                          <input type="checkbox" checked={ing.is_optional ?? false} onChange={e => updateIngredient(i, 'is_optional', e.target.checked)} id={`opt-${i}`} />
                          <label htmlFor={`opt-${i}`} className="text-xs text-gray-500">Optional</label>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={addIngredient} className="btn-secondary w-full text-sm py-2">
                    <Plus className="w-3.5 h-3.5" /> Add ingredient
                  </button>
                </div>
              )}

              {/* Instructions tab */}
              {activeTab === 'instructions' && (
                <div className="space-y-3">
                  {instructions.map((step, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                        <input className="input flex-1 text-sm py-1.5" value={step.title ?? ''} onChange={e => { const u = [...instructions]; u[i] = { ...u[i], title: e.target.value }; setInstructions(u) }} placeholder="Step title" />
                        <input type="number" className="input w-20 text-xs py-1.5" value={step.duration_minutes ?? ''} onChange={e => { const u = [...instructions]; u[i] = { ...u[i], duration_minutes: Number(e.target.value) }; setInstructions(u) }} placeholder="min" />
                        <button onClick={() => setInstructions(instructions.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <textarea className="input text-sm" rows={2} value={step.description ?? ''} onChange={e => { const u = [...instructions]; u[i] = { ...u[i], description: e.target.value }; setInstructions(u) }} placeholder="Describe this step…" />
                    </div>
                  ))}
                  <button onClick={addInstruction} className="btn-secondary w-full text-sm py-2">
                    <Plus className="w-3.5 h-3.5" /> Add step
                  </button>
                </div>
              )}

              {/* Allergens tab */}
              {activeTab === 'allergens' && (
                <div>
                  <p className="text-sm text-gray-500 mb-4">Select all allergens present in this recipe</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {ALLERGENS.map(a => (
                      <button
                        key={a}
                        onClick={() => toggleAllergen(a)}
                        className={cn('p-3 rounded-lg border text-sm font-medium text-center transition-colors',
                          form.allergens.includes(a)
                            ? 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  {form.allergens.length > 0 && (
                    <div className="mt-4 p-3 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-700 font-medium">Contains: {form.allergens.join(', ')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 p-6 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={saveRecipe} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save recipe (new version)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
