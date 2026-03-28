import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Download, FolderOpen, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react'

import Modal from '../components/Modal'
import { api, useAuth } from '../context/AuthContext'
import usePendingNavigationGuard from '../utils/usePendingNavigationGuard'

function sanitizeError(error, fallback) {
    return error?.response?.data?.detail || fallback
}

function formatDateTime(value) {
    if (!value) return 'Sin fecha'
    return new Intl.DateTimeFormat('es-PY', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value))
}

function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = value
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex += 1
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

async function saveBackupBlob(blob, filename) {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [
                    {
                        description: 'Backup de PostgreSQL',
                        accept: { 'application/octet-stream': ['.dump'] },
                    },
                ],
            })
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()
            return
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw error
            }
            // Si el navegador bloquea el selector avanzado, usamos la descarga clasica.
        }
    }

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export default function ConfiguracionBackupsPage() {
    const queryClient = useQueryClient()
    const { user } = useAuth()
    const fileInputRef = useRef(null)
    const [restoreModalOpen, setRestoreModalOpen] = useState(false)
    const [selectedBackup, setSelectedBackup] = useState(null)
    const [restoreConfirmValue, setRestoreConfirmValue] = useState('')
    const [externalRestoreModalOpen, setExternalRestoreModalOpen] = useState(false)
    const [selectedExternalFile, setSelectedExternalFile] = useState(null)
    const [externalRestoreConfirmValue, setExternalRestoreConfirmValue] = useState('')
    const [downloadingFilename, setDownloadingFilename] = useState('')

    const role = String(user?.rol || '').toUpperCase()
    const canEdit = role === 'ADMIN'

    const backupsQuery = useQuery({
        queryKey: ['configuracion-general-backups'],
        queryFn: () => api.get('/configuracion-general/backups').then(response => response.data),
        retry: false,
        enabled: canEdit,
    })

    const crearBackup = useMutation({
        mutationFn: () => api.post('/configuracion-general/backups').then(response => response.data),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general-backups'] })
        },
    })

    const restaurarBackup = useMutation({
        mutationFn: ({ filename, confirmFilename }) => api.post(`/configuracion-general/backups/${encodeURIComponent(filename)}/restore`, {
            confirm_filename: confirmFilename,
        }).then(response => response.data),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general-backups'] })
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general'] })
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general-estado'] })
            setRestoreModalOpen(false)
            setSelectedBackup(null)
            setRestoreConfirmValue('')
        },
    })

    const restaurarBackupExterno = useMutation({
        mutationFn: async ({ file, confirmFilename }) => {
            const formData = new FormData()
            formData.append('confirm_filename', confirmFilename)
            formData.append('backup_file', file)
            return api.post('/configuracion-general/backups/restore-upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            }).then(response => response.data)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general-backups'] })
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general'] })
            await queryClient.invalidateQueries({ queryKey: ['configuracion-general-estado'] })
            setExternalRestoreModalOpen(false)
            setSelectedExternalFile(null)
            setExternalRestoreConfirmValue('')
            if (fileInputRef.current) fileInputRef.current.value = ''
        },
    })

    const descargarBackup = async (backup) => {
        if (!backup?.filename || downloadingFilename) return
        try {
            setDownloadingFilename(backup.filename)
            const response = await api.get(`/configuracion-general/backups/${encodeURIComponent(backup.filename)}/download`, {
                responseType: 'blob',
            })
            await saveBackupBlob(response.data, backup.filename)
        } catch (error) {
            if (error?.name === 'AbortError') {
                return
            }
            window.alert(sanitizeError(error, 'No se pudo descargar el backup.'))
        } finally {
            setDownloadingFilename('')
        }
    }

    const isBackupOperationPending = crearBackup.isPending || restaurarBackup.isPending || restaurarBackupExterno.isPending
    const isBackupUiBusy = isBackupOperationPending || Boolean(downloadingFilename)
    usePendingNavigationGuard(
        isBackupOperationPending,
        'Hay un backup o una restauracion en proceso. ¿Seguro que deseas salir ahora?'
    )

    const backups = backupsQuery.data?.items || []

    const handleCreateBackup = () => {
        crearBackup.mutate(undefined, {
            onSuccess: async (data) => {
                await queryClient.invalidateQueries({ queryKey: ['configuracion-general-backups'] })
                if (data?.backup?.filename) {
                    await descargarBackup(data.backup)
                }
            },
        })
    }

    const handleOpenRestoreModal = backup => {
        if (!canEdit || isBackupUiBusy) return
        setSelectedBackup(backup)
        setRestoreConfirmValue('')
        restaurarBackup.reset()
        setRestoreModalOpen(true)
    }

    const handleCloseRestoreModal = () => {
        if (restaurarBackup.isPending) {
            window.alert('La restauracion sigue en curso. Espera a que termine antes de cerrar este modal.')
            return
        }
        setRestoreModalOpen(false)
        setSelectedBackup(null)
        setRestoreConfirmValue('')
        restaurarBackup.reset()
    }

    const handleExternalFileSelected = event => {
        const file = event.target.files?.[0]
        if (!file || isBackupUiBusy || !canEdit) return
        setSelectedExternalFile(file)
        setExternalRestoreConfirmValue('')
        restaurarBackupExterno.reset()
        setExternalRestoreModalOpen(true)
    }

    const handleCloseExternalRestoreModal = () => {
        if (restaurarBackupExterno.isPending) {
            window.alert('La restauracion sigue en curso. Espera a que termine antes de cerrar este modal.')
            return
        }
        setExternalRestoreModalOpen(false)
        setSelectedExternalFile(null)
        setExternalRestoreConfirmValue('')
        restaurarBackupExterno.reset()
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleRestoreSubmit = event => {
        event.preventDefault()
        if (!selectedBackup || restaurarBackup.isPending) return
        restaurarBackup.mutate({
            filename: selectedBackup.filename,
            confirmFilename: restoreConfirmValue.trim(),
        })
    }

    const handleExternalRestoreSubmit = event => {
        event.preventDefault()
        if (!selectedExternalFile || restaurarBackupExterno.isPending) return
        restaurarBackupExterno.mutate({
            file: selectedExternalFile,
            confirmFilename: externalRestoreConfirmValue.trim(),
        })
    }

    return (
        <div className="page-body" style={{ overflowX: 'hidden' }}>
            <div className="mb-24" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, background: 'rgba(59,130,246,0.14)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Database size={22} style={{ color: 'var(--primary-light)' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Backups del sistema</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        Genera y restaura backups locales del tenant actual desde una pantalla separada de Datos Generales.
                    </p>
                </div>
            </div>

            {!canEdit && (
                <div className="card mb-16" style={{ border: '1px solid rgba(251,191,36,0.28)', background: 'rgba(251,191,36,0.08)' }}>
                    <div style={{ color: '#fde68a', fontSize: '0.9rem', lineHeight: 1.5 }}>
                        Solo un administrador puede crear o restaurar backups.
                    </div>
                </div>
            )}

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Backups disponibles</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>
                            La restauracion reemplaza el estado actual del tenant. Usala solo cuando estés seguro.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".dump"
                            onChange={handleExternalFileSelected}
                            style={{ display: 'none' }}
                        />
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!canEdit || isBackupUiBusy}
                        >
                            <FolderOpen size={16} />
                            Buscar archivo backup
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleCreateBackup}
                            disabled={!canEdit || isBackupUiBusy || backupsQuery.isFetching}
                        >
                            {crearBackup.isPending
                                ? <><RefreshCw size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Generando backup...</>
                                : <><Database size={16} /> Crear y guardar backup</>}
                        </button>
                    </div>
                </div>

                {(crearBackup.isError || backupsQuery.isError || restaurarBackupExterno.isError) && (
                    <div style={{ marginBottom: 12, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                        {sanitizeError(crearBackup.error || backupsQuery.error || restaurarBackupExterno.error, 'No se pudieron cargar los backups.')}
                    </div>
                )}

                {crearBackup.isSuccess && (
                    <div style={{ marginBottom: 12, background: 'rgba(34,197,94,0.10)', color: '#86efac', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                        {crearBackup.data?.message || 'Backup generado correctamente.'}
                    </div>
                )}

                <div style={{ display: 'grid', gap: 10 }}>
                    {backupsQuery.isLoading ? (
                        <div className="flex-center" style={{ minHeight: 120 }}>
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                        </div>
                    ) : backups.length === 0 ? (
                        <div style={{ border: '1px dashed var(--border-color)', borderRadius: 12, padding: 16, color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                            Todavía no hay backups guardados para este tenant.
                        </div>
                    ) : backups.map(backup => (
                        <div key={backup.filename} style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, wordBreak: 'break-all' }}>{backup.filename}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                                    {formatDateTime(backup.created_at)} · {formatBytes(backup.size_bytes)}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => descargarBackup(backup)}
                                    disabled={!canEdit || isBackupUiBusy}
                                >
                                    {downloadingFilename === backup.filename
                                        ? <><RefreshCw size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Descargando...</>
                                        : <><Download size={16} /> Descargar</>}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleOpenRestoreModal(backup)}
                                    disabled={!canEdit || isBackupUiBusy}
                                >
                                    <RotateCcw size={16} />
                                    Restaurar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {restoreModalOpen && selectedBackup && (
                <Modal
                    title="Restaurar backup"
                    onClose={handleCloseRestoreModal}
                    closeOnBackdrop={!restaurarBackup.isPending}
                    closeDisabled={restaurarBackup.isPending}
                    onCloseAttempt={() => window.alert('La restauracion sigue en curso. Espera a que termine antes de cerrar este modal.')}
                    maxWidth="680px"
                >
                    <form onSubmit={handleRestoreSubmit}>
                        <div style={{ display: 'grid', gap: 14 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }}>
                                <TriangleAlert size={18} style={{ color: '#fca5a5', flexShrink: 0, marginTop: 2 }} />
                                <div style={{ color: '#fecaca', fontSize: '0.9rem', lineHeight: 1.55 }}>
                                    Esta accion reemplazará la información actual del tenant con el contenido del backup seleccionado. No cierres esta ventana ni salgas de la pantalla mientras la restauracion esté en curso.
                                </div>
                            </div>

                            <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ fontWeight: 700, marginBottom: 6, wordBreak: 'break-all' }}>{selectedBackup.filename}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                    {formatDateTime(selectedBackup.created_at)} · {formatBytes(selectedBackup.size_bytes)}
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">
                                    Escribe exactamente el nombre del backup para confirmar la restauracion
                                </label>
                                <input
                                    className="form-input"
                                    value={restoreConfirmValue}
                                    onChange={event => setRestoreConfirmValue(event.target.value)}
                                    disabled={restaurarBackup.isPending}
                                    autoFocus
                                />
                            </div>

                            {restaurarBackup.isError && (
                                <div style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                                    {sanitizeError(restaurarBackup.error, 'No se pudo restaurar el backup.')}
                                </div>
                            )}

                            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleCloseRestoreModal}
                                    disabled={restaurarBackup.isPending}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={restaurarBackup.isPending || restoreConfirmValue.trim() !== selectedBackup.filename}
                                    style={{ background: 'linear-gradient(135deg, #b91c1c, #ef4444)' }}
                                >
                                    {restaurarBackup.isPending
                                        ? <><RefreshCw size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Restaurando backup...</>
                                        : <><RotateCcw size={16} /> Confirmar restauracion</>}
                                </button>
                            </div>
                        </div>
                    </form>
                </Modal>
            )}

            {externalRestoreModalOpen && selectedExternalFile && (
                <Modal
                    title="Restaurar backup externo"
                    onClose={handleCloseExternalRestoreModal}
                    closeOnBackdrop={!restaurarBackupExterno.isPending}
                    closeDisabled={restaurarBackupExterno.isPending}
                    onCloseAttempt={() => window.alert('La restauracion sigue en curso. Espera a que termine antes de cerrar este modal.')}
                    maxWidth="680px"
                >
                    <form onSubmit={handleExternalRestoreSubmit}>
                        <div style={{ display: 'grid', gap: 14 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }}>
                                <TriangleAlert size={18} style={{ color: '#fca5a5', flexShrink: 0, marginTop: 2 }} />
                                <div style={{ color: '#fecaca', fontSize: '0.9rem', lineHeight: 1.55 }}>
                                    Vas a restaurar un backup externo seleccionado desde tu equipo o un pendrive. Esta accion reemplazará la información actual del tenant.
                                </div>
                            </div>

                            <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ fontWeight: 700, marginBottom: 6, wordBreak: 'break-all' }}>{selectedExternalFile.name}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                    {formatBytes(selectedExternalFile.size)} · Archivo externo seleccionado
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">
                                    Escribe exactamente el nombre del archivo para confirmar la restauracion
                                </label>
                                <input
                                    className="form-input"
                                    value={externalRestoreConfirmValue}
                                    onChange={event => setExternalRestoreConfirmValue(event.target.value)}
                                    disabled={restaurarBackupExterno.isPending}
                                    autoFocus
                                />
                            </div>

                            {restaurarBackupExterno.isError && (
                                <div style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' }}>
                                    {sanitizeError(restaurarBackupExterno.error, 'No se pudo restaurar el backup externo.')}
                                </div>
                            )}

                            <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleCloseExternalRestoreModal}
                                    disabled={restaurarBackupExterno.isPending}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={restaurarBackupExterno.isPending || externalRestoreConfirmValue.trim() !== selectedExternalFile.name}
                                    style={{ background: 'linear-gradient(135deg, #b91c1c, #ef4444)' }}
                                >
                                    {restaurarBackupExterno.isPending
                                        ? <><RefreshCw size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Restaurando archivo...</>
                                        : <><RotateCcw size={16} /> Restaurar archivo externo</>}
                                </button>
                            </div>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}
