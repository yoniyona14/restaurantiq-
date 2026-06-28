'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    toast.success('Welcome back!')
    // Use a hard navigation instead of router.push so the freshly-set auth
    // cookie is guaranteed to be there by the time middleware checks it.
    // (router.push alone occasionally raced ahead of the cookie write,
    // causing a bounce back to /auth/login right after a successful login.)
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-500 rounded-2xl mb-4 shadow-lg shadow-brand-500/30">
            <span className="text-2xl">🍽️</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">RestaurantIQ</h1>
          <p className="text-brand-300 text-sm mt-1">Smart management for Ethiopian restaurants</p>
        </div>

        {/* Form */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <h2 className="text-white font-medium mb-6">Sign in to your account</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-brand-200 mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@restaurant.com"
                required
                className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white
                           placeholder:text-white/30 text-sm focus:outline-none focus:ring-2
                           focus:ring-brand-400 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-brand-200 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white
                           placeholder:text-white/30 text-sm focus:outline-none focus:ring-2
                           focus:ring-brand-400 focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-brand-500 hover:bg-brand-400 text-white font-medium
                         rounded-lg text-sm transition-all duration-150 active:scale-95
                         disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="text-center mt-4">
            <a href="/auth/forgot-password" className="text-xs text-brand-300 hover:text-white transition-colors">
              Forgot your password?
            </a>
          </p>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          RestaurantIQ © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}