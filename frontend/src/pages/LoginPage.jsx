import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { LogIn } from 'lucide-react'
import PasswordField from '../components/PasswordField'
import { api } from '../context/AuthContext'

export default function LoginPage() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const { data: configPublica } = useQuery({
        queryKey: ['configuracion-general-publica'],
        queryFn: () => api.get('/configuracion-general/publica').then(response => response.data),
        retry: false,
    })

    const backendBaseUrl = useMemo(() => {
        const base = api.defaults.baseURL || ''
        if (typeof base === 'string' && /^https?:\/\//i.test(base)) {
            return base.replace(/\/api\/?$/, '')
        }
        return window.location.origin
    }, [])

    const logoUrl = useMemo(() => {
        const logoPath = configPublica?.logo_path
        if (!logoPath) return ''
        if (/^https?:\/\//i.test(logoPath)) return logoPath
        return `${backendBaseUrl}${logoPath}`
    }, [backendBaseUrl, configPublica?.logo_path])

    const handleSubmit = async event => {
        event.preventDefault()
        setError('')
        setLoading(true)
        try {
            await login(form.email, form.password)
            navigate('/')
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al iniciar sesion. Verifica tus credenciales.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    {logoUrl ? (
                        <div style={{ width: 96, height: 96, margin: '0 auto 12px', borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                            <img src={logoUrl} alt="Logo institucional" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                    ) : (
                        <div className="login-logo-icon">H</div>
                    )}
                    <h1>{configPublica?.nombre || 'HESAKA Web'}</h1>
                    <p>Sistema de Gestion para Opticas</p>
                </div>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="tu@email.com"
                            value={form.email}
                            onChange={event => setForm({ ...form, email: event.target.value })}
                            required
                            autoFocus
                        />
                    </div>

                    <PasswordField
                        label="Contrasena"
                        value={form.password}
                        onChange={event => setForm({ ...form, password: event.target.value })}
                        required
                        placeholder="********"
                        autoComplete="current-password"
                        name="password"
                    />

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ width: '100%', justifyContent: 'center', marginTop: '8px', padding: '12px' }}
                    >
                        {loading ? (
                            <span className="spinner" style={{ width: 18, height: 18 }} />
                        ) : (
                            <><LogIn size={18} /> Iniciar sesion</>
                        )}
                    </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '24px' }}>
                    HESAKA Web v1.0 - Sistema multi-tenant
                </p>
            </div>
        </div>
    )
}
