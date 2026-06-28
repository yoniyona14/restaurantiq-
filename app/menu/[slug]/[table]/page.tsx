import { createAdminClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { notFound } from 'next/navigation'
import MenuClient from './MenuClient'

export const revalidate = 0

export default async function PublicMenuPage({ params }: { params: { slug: string; table: string } }) {
  const supabase = createAdminClient()

  const { data: restaurant } = await supabase.from('restaurants').select('*').eq('slug', params.slug).single()
  if (!restaurant) notFound()

  const [{ data: categories }, { data: items }, { data: table }] = await Promise.all([
    supabase.from('menu_categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
    supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id).eq('is_available', true).order('name'),
    supabase.from('tables').select('*').eq('restaurant_id', restaurant.id).eq('table_number', Number(params.table)).maybeSingle(),
  ])

  // Log the view for analytics
  if (table) {
    await supabase.from('menu_views').insert({
      table_id: table.id,
      restaurant_id: restaurant.id,
      device_type: 'mobile',
    })
  }

  return (
    <MenuClient
      restaurant={restaurant}
      categories={categories ?? []}
      items={items ?? []}
      tableNumber={params.table}
    />
  )
}
