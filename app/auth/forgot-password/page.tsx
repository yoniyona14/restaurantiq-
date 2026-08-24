'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/dashboard`,
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-500 rounded-2xl mb-4 shadow-lg shadow-brand-500/30">
            <span className="text-2xl">🍽️</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">RestaurantIQ</h1>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          {sent ? (
            <div className="text-center py-4">
              <p className="text-white font-medium mb-2">Check your email</p>
              <p className="text-brand-200 text-sm">We've sent a password reset link to {email}</p>
            </div>
          ) : (
            <>
              <h2 className="text-white font-medium mb-2">Reset your password</h2>
              <p className="text-brand-200 text-sm mb-6">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={handleReset} className="space-y-4">
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@restaurant.com" required
                  className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white
                             placeholder:text-white/30 text-sm focus:outline-none focus:ring-2
                             focus:ring-brand-400 focus:border-transparent transition-all"
                />
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 bg-brand-500 hover:bg-brand-400 text-white font-medium
                             rounded-lg text-sm transition-all duration-150 active:scale-95 disabled:opacity-50">
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
          <p className="text-center mt-4">
            <a href="/auth/login" className="text-xs text-brand-300 hover:text-white transition-colors">← Back to sign in</a>
          </p>
        </div>
      </div>
    </div>
  )
}
