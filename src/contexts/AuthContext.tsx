import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { expireAuthSession, logoutAuthSession, readAuthSession, refreshAuthSession } from '../lib/api'
import { loginSystem as loginSystemRequest } from '../lib/systemApi'
import type { AuthSession, SystemUser } from '../types'

const AUTH_STORAGE_KEY = 'ai-dandelion-auth'

type AuthContextValue = {
  session: AuthSession | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  currentUser: SystemUser | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSession(readAuthSession())
    setLoading(false)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const next = await loginSystemRequest({ username, password })
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
    setSession(next)
  }, [])

  const logout = useCallback(() => {
    logoutAuthSession()
    setSession(null)
  }, [])

  useEffect(() => {
    const handleExpired = () => setSession(null)
    const handleUpdated = (event: Event) => {
      const next = (event as CustomEvent<AuthSession>).detail
      if (next?.user?.id) setSession(next)
    }
    window.addEventListener('ai-dandelion-auth-expired', handleExpired)
    window.addEventListener('ai-dandelion-auth-updated', handleUpdated)
    return () => {
      window.removeEventListener('ai-dandelion-auth-expired', handleExpired)
      window.removeEventListener('ai-dandelion-auth-updated', handleUpdated)
    }
  }, [])

  useEffect(() => {
    if (!session?.refreshToken || !session.accessExpiresAt) return undefined
    const delay = Math.max(1000, session.accessExpiresAt - Date.now() - 60_000)
    const timer = window.setTimeout(() => {
      void refreshAuthSession().then((next) => {
        if (!next) expireAuthSession()
      })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [session])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      login,
      logout,
      currentUser: session?.user ?? null,
    }),
    [loading, login, logout, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
