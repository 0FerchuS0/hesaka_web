// HESAKA Web — Contexto de Autenticación
import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const DEFAULT_TENANT = import.meta.env.VITE_TENANT_SLUG || ''

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
            localStorage.removeItem('hesaka_token')
            localStorage.removeItem('hesaka_user')
            window.location.href = '/login'
        }
        return Promise.reject(err)
    }
)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const savedUser = localStorage.getItem('hesaka_user')
        const savedToken = localStorage.getItem('hesaka_token')
        if (savedUser && savedToken) {
            try { setUser(JSON.parse(savedUser)) } catch (_) { }
        }
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
