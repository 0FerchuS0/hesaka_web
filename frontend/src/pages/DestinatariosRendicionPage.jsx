import { useState } from 'react'
import { HandCoins } from 'lucide-react'

import {
    useActualizarDestinatarioRendicion,
    useCrearDestinatarioRendicion,
    useDestinatariosRendicionCatalog,
    useEliminarDestinatarioRendicion,
} from '../hooks/useFinancialJornada'
import { useAuth } from '../context/AuthContext'
import { normalizeRole } from '../utils/roles'

export default function DestinatariosRendicionPage() {
    const { user } = useAuth()
    const canEdit = normalizeRole(user?.rol) === 'ADMIN'
    const { data: lista = [], isLoading } = useDestinatariosRendicionCatalog()
    const crear = useCrearDestinatarioRendicion()
    const actualizar = useActualizarDestinatarioRendicion()
    const eliminar = useEliminarDestinatarioRendicion()
    const [nuevoNombre, setNuevoNombre] = useState('')
    const [editandoId, setEditandoId] = useState(null)
    const [textoEdicion, setTextoEdicion] = useState('')

    const handleCrear = event => {
        event.preventDefault()
        if (!canEdit) return
        const n = nuevoNombre.trim()
        if (!n) return
        crear.mutate(
            { nombre: n },
            {
                onSuccess: () => {
                    setNuevoNombre('')
                },
            },
        )
    }

    const guardarNombre = row => {
        if (!canEdit) return
        const t = textoEdicion.trim()
        if (!t) return
        actualizar.mutate(
            { id: row.id, payload: { nombre: t } },
            {
                onSuccess: () => {
                    setEditandoId(null)
                    setTextoEdicion('')
                },
            },
        )
    }

    return (
        <div className="page-body">
            <div className="mb-24" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, background: 'rgba(245,158,11,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <HandCoins size={22} style={{ color: '#f59e0b' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Destinatarios de rendicion</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        Catalogo de personas autorizadas para recibir rendiciones de caja.
                    </p>
                </div>
            </div>

            {!canEdit ? (
                <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)' }}>
                    <div style={{ color: '#fde68a', fontSize: '0.9rem' }}>
                        Solo un administrador puede crear, editar, activar/desactivar o eliminar destinatarios.
                    </div>
                </div>
            ) : null}

            <div className="card">
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.45 }}>
                    ABM de destinatarios: alta, renombrar, activar/desactivar y eliminar (solo si no tiene rendiciones asociadas).
                </p>

                <form onSubmit={handleCrear} className="flex gap-10" style={{ flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
                    <div className="form-group" style={{ flex: '1 1 280px', marginBottom: 0 }}>
                        <label className="form-label">Nuevo destinatario</label>
                        <input
                            className="form-input"
                            value={nuevoNombre}
                            onChange={event => setNuevoNombre(event.target.value)}
                            placeholder="Nombre completo"
                            maxLength={150}
                            disabled={!canEdit}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={!canEdit || crear.isPending || !nuevoNombre.trim()}>
                        {crear.isPending ? 'Guardando...' : 'Agregar'}
                    </button>
                </form>

                {crear.isError ? (
                    <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: 12 }}>
                        {crear.error?.response?.data?.detail || 'No se pudo crear el destinatario.'}
                    </div>
                ) : null}

                {isLoading ? (
                    <div className="flex-center" style={{ padding: 40 }}>
                        <div className="spinner" style={{ width: 28, height: 28 }} />
                    </div>
                ) : (
                    <div className="table-wrapper" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Estado</th>
                                    <th style={{ width: 260 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map(row => (
                                    <tr key={row.id}>
                                        <td>
                                            {editandoId === row.id ? (
                                                <input
                                                    className="form-input"
                                                    value={textoEdicion}
                                                    onChange={event => setTextoEdicion(event.target.value)}
                                                    style={{ marginBottom: 0 }}
                                                />
                                            ) : (
                                                row.nombre
                                            )}
                                        </td>
                                        <td>
                                            <span style={{ color: row.activo ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700 }}>
                                                {row.activo ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td>
                                            {!canEdit ? '—' : (
                                                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                                                    {editandoId === row.id ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="btn btn-primary btn-sm"
                                                                disabled={actualizar.isPending}
                                                                onClick={() => guardarNombre(row)}
                                                            >
                                                                Guardar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={() => {
                                                                    setEditandoId(null)
                                                                    setTextoEdicion('')
                                                                }}
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={() => {
                                                                    setEditandoId(row.id)
                                                                    setTextoEdicion(row.nombre)
                                                                }}
                                                            >
                                                                Renombrar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-sm"
                                                                disabled={actualizar.isPending || eliminar.isPending}
                                                                onClick={() => actualizar.mutate({ id: row.id, payload: { activo: !row.activo } })}
                                                            >
                                                                {row.activo ? 'Desactivar' : 'Reactivar'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-sm"
                                                                disabled={eliminar.isPending}
                                                                onClick={() => {
                                                                    if (!window.confirm(`¿Eliminar destinatario "${row.nombre}"?`)) return
                                                                    eliminar.mutate(row.id)
                                                                }}
                                                            >
                                                                Eliminar
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {lista.length === 0 ? (
                            <div style={{ padding: 16, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                Todavia no hay destinatarios cargados.
                            </div>
                        ) : null}
                    </div>
                )}

                {actualizar.isError ? (
                    <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 12 }}>
                        {actualizar.error?.response?.data?.detail || 'No se pudo actualizar.'}
                    </div>
                ) : null}
                {eliminar.isError ? (
                    <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 12 }}>
                        {eliminar.error?.response?.data?.detail || 'No se pudo eliminar.'}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
