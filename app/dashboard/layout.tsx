import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/ui/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Fetch user profile with restaurant info
  const { data: profile } = await supabase
    .from('users')
    .select('*, restaurants(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const restaurantName = (profile.restaurants as any)?.name || 'My Restaurant'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        role={profile.role}
        restaurantName={restaurantName}
        userName={profile.name}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
