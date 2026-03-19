import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogIn } from 'lucide-react'
import PasswordField from '../components/PasswordField'

export default function LoginPage() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

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
                    <div className="login-logo-icon">H</div>
                    <h1>HESAKA Web</h1>
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
