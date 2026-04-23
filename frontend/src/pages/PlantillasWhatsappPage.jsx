import { useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { normalizeRole } from '../utils/roles'
import { useActualizarWhatsappTemplate, useWhatsappTemplatesCatalog } from '../hooks/useWhatsappTemplates'

export default function PlantillasWhatsappPage() {
    const { user } = useAuth()
    const canEdit = normalizeRole(user?.rol) === 'ADMIN'
    const { data = [], isLoading } = useWhatsappTemplatesCatalog()
    const actualizar = useActualizarWhatsappTemplate()
    const [editandoCodigo, setEditandoCodigo] = useState('')
    const [textoEdicion, setTextoEdicion] = useState('')

    const filas = useMemo(
        () => [...data].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')),
        [data],
    )

    const comenzarEdicion = row => {
        setEditandoCodigo(row.codigo)
        setTextoEdicion(row.plantilla || '')
    }

    const guardar = row => {
        if (!canEdit) return
        const plantilla = String(textoEdicion || '').trim()
        if (!plantilla) return
        actualizar.mutate(
            { codigo: row.codigo, payload: { plantilla, activo: row.activo } },
            {
                onSuccess: () => {
                    setEditandoCodigo('')
                    setTextoEdicion('')
                },
            },
        )
    }

    const toggleActivo = row => {
        if (!canEdit) return
        actualizar.mutate({ codigo: row.codigo, payload: { plantilla: row.plantilla, activo: !row.activo } })
    }

    return (
        <div className="page-body">
            <div className="mb-24" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, background: 'rgba(52,211,153,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={22} style={{ color: '#34d399' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Plantillas de WhatsApp</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        Catalogo centralizado por empresa para mensajes predefinidos.
                    </p>
                </div>
            </div>

            {!canEdit ? (
                <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)' }}>
                    <div style={{ color: '#fde68a', fontSize: '0.9rem' }}>
                        Solo un administrador puede modificar o activar/desactivar las plantillas.
                    </div>
                </div>
            ) : null}

            <div className="card">
                {isLoading ? (
                    <div className="flex-center" style={{ padding: 40 }}>
                        <div className="spinner" style={{ width: 28, height: 28 }} />
                    </div>
                ) : (
                    <div className="table-wrapper" style={{ overflow: 'auto', maxHeight: '70vh' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Plantilla</th>
                                    <th>Descripcion</th>
                                    <th>Estado</th>
                                    <th style={{ width: 300 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.map(row => (
                                    <tr key={row.codigo}>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{row.nombre}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: 2 }}>{row.codigo}</div>
                                            <div style={{ marginTop: 10 }}>
                                                {editandoCodigo === row.codigo ? (
                                                    <textarea
                                                        className="form-input"
                                                        rows={5}
                                                        value={textoEdicion}
                                                        onChange={event => setTextoEdicion(event.target.value)}
                                                        style={{ minWidth: 380, resize: 'vertical' }}
                                                    />
                                                ) : (
                                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                                                        {row.plantilla}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{row.descripcion || '-'}</td>
                                        <td>
                                            <span style={{ color: row.activo ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700 }}>
                                                {row.activo ? 'Activa' : 'Inactiva'}
                                            </span>
                                        </td>
                                        <td>
                                            {!canEdit ? '—' : (
                                                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                                                    {editandoCodigo === row.codigo ? (
                                                        <>
                                                            <button type="button" className="btn btn-primary btn-sm" disabled={actualizar.isPending || !textoEdicion.trim()} onClick={() => guardar(row)}>
                                                                Guardar
                                                            </button>
                                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditandoCodigo(''); setTextoEdicion('') }}>
                                                                Cancelar
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => comenzarEdicion(row)}>
                                                            Editar texto
                                                        </button>
                                                    )}
                                                    <button type="button" className="btn btn-secondary btn-sm" disabled={actualizar.isPending} onClick={() => toggleActivo(row)}>
                                                        {row.activo ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {actualizar.isError ? (
                    <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 12 }}>
                        {actualizar.error?.response?.data?.detail || 'No se pudo actualizar la plantilla.'}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
