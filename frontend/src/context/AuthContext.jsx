// HESAKA Web — Contexto de Autenticación
import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const DEFAULT_TENANT = import.meta.env.VITE_TENANT_SLUG || ''

/** Base de API: si VITE_API_BASE_URL es absoluta y no termina en /api, se agrega (evita 404 en login). */
function resolveApiBaseUrl() {
    const raw = (import.meta.env.VITE_API_BASE_URL || '/api').trim()
    if (!raw) return '/api'
    if (raw === '/api' || /\/api$/i.test(raw)) return raw.replace(/\/$/, '') || '/api'
    if (/^https?:\/\//i.test(raw)) {
        const t = raw.replace(/\/$/, '')
        return /\/api$/i.test(t) ? t : `${t}/api`
    }
    return raw.startsWith('/') ? raw : `/${raw}`
}

const API_BASE = resolveApiBaseUrl()

// Axios instance con token automático
export const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('hesaka_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    if (DEFAULT_TENANT && !config.headers['X-Tenant-Slug']) {
        config.headers['X-Tenant-Slug'] = DEFAULT_TENANT
    }
    return config
})

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            // Solo la ruta relativa (p. ej. /auth/login); no concatenar baseURL+url (Axios puede omitir /).
            const isLoginAttempt = /auth\/login/i.test(String(err.config?.url || ''))
            if (!isLoginAttempt) {
                localStorage.removeItem('hesaka_token')
                localStorage.removeItem('hesaka_user')
                window.location.href = '/login'
            }
        }
        return Promise.reject(err)
    }
)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Política solicitada: siempre iniciar por login para evitar sesiones viejas inconsistentes.
        localStorage.removeItem('hesaka_token')
        localStorage.removeItem('hesaka_user')
        setUser(null)
        setLoading(false)
    }, [])

    const login = async (email, password) => {
        const res = await api.post('/auth/login', { email, password })
        const data = res.data
        localStorage.setItem('hesaka_token', data.access_token)
        localStorage.setItem('hesaka_user', JSON.stringify(data))
        setUser(data)
        return data
    }

    const logout = () => {
        localStorage.removeItem('hesaka_token')
        localStorage.removeItem('hesaka_user')
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
