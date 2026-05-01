import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../context/AuthContext'
import { parseBackendDateTime } from '../utils/formatters'
import Modal from '../components/Modal'
import PasswordField from '../components/PasswordField'
import { KeyRound, Plus, Search, Shield, UserCog } from 'lucide-react'
import { defaultActionPermissionsForRole, defaultPermissionsForRole, permissionCatalog } from '../utils/roles'

function fmtFecha(value) {
    if (!value) return '-'
    const date = parseBackendDateTime(value)
    return date ? date.toLocaleString('es-PY') : '-'
}

function rolBadge(rol) {
    const map = {
        ADMIN: 'badge-red',
        CAJERO: 'badge-blue',
        OPERADOR: 'badge-green',
        DOCTOR: 'badge-purple',
        USUARIO: 'badge-green',
        CLINICA: 'badge-purple',
    }
    return <span className={`badge ${map[String(rol || '').toUpperCase()] || 'badge-gray'}`}>{rol || '-'}</span>
}

function UsuarioForm({ onSave, onCancel, loading }) {
    const [form, setForm] = useState({
        nombre_completo: '',
        email: '',
        rol: 'OPERADOR',
        password: '',
    })

    const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(form) }}>
            <div className="grid-2">
                <div className="form-group">
                    <label className="form-label">Nombre completo</label>
                    <input className="form-input" value={form.nombre_completo} onChange={event => set('nombre_completo', event.target.value)} required />
                </div>
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={form.email} onChange={event => set('email', event.target.value)} required />
                </div>
                <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select className="form-select" value={form.rol} onChange={event => set('rol', event.target.value)}>
                        <option value="ADMIN">ADMIN</option>
                        <option value="CAJERO">CAJERO</option>
                        <option value="OPERADOR">OPERADOR</option>
                        <option value="DOCTOR">DOCTOR</option>
                    </select>
                </div>
                <PasswordField
                    label="Contrasena inicial"
                    value={form.password}
                    onChange={event => set('password', event.target.value)}
                    required
                    autoComplete="new-password"
                    name="password"
                />
            </div>
            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Crear usuario'}</button>
            </div>
        </form>
    )
}

function PasswordForm({ usuario, onSave, onCancel, loading }) {
    const [password, setPassword] = useState('')
    const [confirmacion, setConfirmacion] = useState('')
    const [error, setError] = useState('')

    const submit = event => {
        event.preventDefault()
        if (!password.trim()) {
            setError('Debe ingresar una contrasena.')
            return
        }
        if (password !== confirmacion) {
            setError('Las contrasenas no coinciden.')
            return
        }
        setError('')
        onSave(password)
    }

    return (
        <form onSubmit={submit}>
            <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700 }}>{usuario.nombre_completo}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 4 }}>{usuario.email}</div>
            </div>
            <PasswordField
                label="Nueva contrasena"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                autoComplete="new-password"
                name="new-password"
            />
            <PasswordField
                label="Confirmar contrasena"
                value={confirmacion}
                onChange={event => setConfirmacion(event.target.value)}
                required
                autoComplete="new-password"
                name="confirm-password"
            />
            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: '0.84rem', marginBottom: 12 }}>
                    {error}
                </div>
            )}
            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Actualizar contrasena'}</button>
            </div>
        </form>
    )
}

function PermisosForm({ usuario, onSave, onCancel, loading }) {
    const [permisos, setPermisos] = useState(() => {
        if (Array.isArray(usuario.permisos) && usuario.permisos.length > 0) {
            return usuario.permisos
        }
        return [
            ...defaultPermissionsForRole(usuario.rol),
            ...defaultActionPermissionsForRole(usuario.rol),
        ]
    })

    const has = key => permisos.includes(key)

    const toggleModule = item => {
        setPermisos(prev => {
            const next = new Set(prev)
            const moduleEnabled = next.has(item.key)

            if (moduleEnabled) {
                next.delete(item.key)
                ;(item.actions || []).forEach(action => next.delete(action.key))
            } else {
                next.add(item.key)
                ;(item.actions || []).forEach(action => next.add(action.key))
            }
            return Array.from(next)
        })
    }

    const toggleAction = (moduleKey, actionKey) => {
        setPermisos(prev => {
            const next = new Set(prev)
            if (next.has(actionKey)) {
                next.delete(actionKey)
            } else {
                next.add(moduleKey)
                next.add(actionKey)
            }
            return Array.from(next)
        })
    }

    return (
        <form onSubmit={event => { event.preventDefault(); onSave(permisos) }}>
            <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700 }}>{usuario.nombre_completo}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 4 }}>
                    {usuario.email} - Rol base: {usuario.rol}
                </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
                {permissionCatalog.map(group => (
                    <div key={group.group} className="card" style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, marginBottom: 10 }}>{group.group}</div>
                        <div style={{ display: 'grid', gap: 8 }}>
                            {group.items.map(item => (
                                <div key={item.key} style={{ display: 'grid', gap: 8 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer', fontWeight: 600 }}>
                                        <input
                                            type="checkbox"
                                            checked={has(item.key)}
                                            onChange={() => toggleModule(item)}
                                        />
                                        <span>{item.label}</span>
                                    </label>
                                    {item.actions?.length > 0 && (
                                        <div style={{ display: 'grid', gap: 6, paddingLeft: 28 }}>
                                            {item.actions.map(action => (
                                                <label key={action.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={has(action.key)}
                                                        onChange={() => toggleAction(item.key, action.key)}
                                                    />
                                                    <span>{action.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex gap-12" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar permisos'}</button>
            </div>
        </form>
    )
}

export default function UsuariosPage() {
    const qc = useQueryClient()
    const [buscar, setBuscar] = useState('')
    const [modalNuevo, setModalNuevo] = useState(false)
    const [usuarioPassword, setUsuarioPassword] = useState(null)
    const [usuarioPermisos, setUsuarioPermisos] = useState(null)

    const { data = [], isLoading, isError, error } = useQuery({
        queryKey: ['usuarios'],
        queryFn: () => api.get('/auth/usuarios').then(res => res.data),
        retry: false,
    })

    const crearUsuario = useMutation({
        mutationFn: payload => api.post('/auth/usuarios', payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['usuarios'] })
            setModalNuevo(false)
        },
    })

    const cambiarPassword = useMutation({
        mutationFn: ({ id, password }) => api.put(`/auth/usuarios/${id}/password`, { password }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['usuarios'] })
            setUsuarioPassword(null)
        },
    })

    const cambiarEstado = useMutation({
        mutationFn: ({ id, activo }) => api.put(`/auth/usuarios/${id}/estado`, { activo }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
    })

    const cambiarPermisos = useMutation({
        mutationFn: ({ id, permisos }) => api.put(`/auth/usuarios/${id}/permisos`, { permisos }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['usuarios'] })
            setUsuarioPermisos(null)
        },
    })

    const usuarios = useMemo(() => {
        const q = buscar.trim().toLowerCase()
        if (!q) return data
        return data.filter(item =>
            item.nombre_completo?.toLowerCase().includes(q) ||
            item.email?.toLowerCase().includes(q) ||
            item.rol?.toLowerCase().includes(q)
        )
    }, [data, buscar])

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'rgba(26,86,219,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={20} style={{ color: 'var(--primary-light)' }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Usuarios y Roles</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{usuarios.length} usuarios visibles</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setModalNuevo(true)}>
                    <Plus size={16} /> Nuevo Usuario
                </button>
            </div>

            <div className="card mb-16" style={{ padding: '14px 20px', width: '100%', maxWidth: '100%' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="search-bar" style={{ flex: '1 1 320px', minWidth: 240 }}>
                        <Search size={16} />
                        <input
                            placeholder="Buscar por nombre, email o rol..."
                            value={buscar}
                            onChange={event => setBuscar(event.target.value)}
                        />
                    </div>
                </div>
                {isError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem', marginTop: 10 }}>
                        {error?.response?.data?.detail || 'No se pudieron cargar los usuarios.'}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 60 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : usuarios.length === 0 ? (
                    <div className="empty-state">
                        <UserCog size={40} />
                        <p>No hay usuarios para mostrar.</p>
                    </div>
                ) : (
                    <div className="table-container" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                        <table style={{ minWidth: 940 }}>
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Email</th>
                                    <th>Rol</th>
                                    <th>Estado</th>
                                    <th>Creado</th>
                                    <th>Ultimo acceso</th>
                                    <th style={{ width: 220 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usuarios.map(usuario => (
                                    <tr key={usuario.id}>
                                        <td style={{ fontWeight: 700 }}>{usuario.nombre_completo}</td>
                                        <td>{usuario.email}</td>
                                        <td>{rolBadge(usuario.rol)}</td>
                                        <td>
                                            <span className={`badge ${usuario.activo ? 'badge-green' : 'badge-red'}`}>
                                                {usuario.activo ? 'ACTIVO' : 'INACTIVO'}
                                            </span>
                                        </td>
                                        <td>{fmtFecha(usuario.creado_en)}</td>
                                        <td>{fmtFecha(usuario.ultimo_acceso)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setUsuarioPassword(usuario)}>
                                                    <KeyRound size={14} /> Contrasena
                                                </button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setUsuarioPermisos(usuario)}>
                                                    <Shield size={14} /> Permisos
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => cambiarEstado.mutate({ id: usuario.id, activo: !usuario.activo })}
                                                >
                                                    {usuario.activo ? 'Desactivar' : 'Activar'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modalNuevo && (
                <Modal title="Nuevo Usuario" onClose={() => setModalNuevo(false)} maxWidth="720px">
                    <UsuarioForm
                        onSave={payload => crearUsuario.mutate(payload)}
                        onCancel={() => setModalNuevo(false)}
                        loading={crearUsuario.isPending}
                    />
                </Modal>
            )}

            {usuarioPassword && (
                <Modal title="Actualizar Contrasena" onClose={() => setUsuarioPassword(null)} maxWidth="560px">
                    <PasswordForm
                        usuario={usuarioPassword}
                        onSave={password => cambiarPassword.mutate({ id: usuarioPassword.id, password })}
                        onCancel={() => setUsuarioPassword(null)}
                        loading={cambiarPassword.isPending}
                    />
                </Modal>
            )}

            {usuarioPermisos && (
                <Modal title="Permisos por Usuario" onClose={() => setUsuarioPermisos(null)} maxWidth="760px">
                    <PermisosForm
                        usuario={usuarioPermisos}
                        onSave={permisos => cambiarPermisos.mutate({ id: usuarioPermisos.id, permisos })}
                        onCancel={() => setUsuarioPermisos(null)}
                        loading={cambiarPermisos.isPending}
                    />
                </Modal>
            )}
        </div>
    )
}
