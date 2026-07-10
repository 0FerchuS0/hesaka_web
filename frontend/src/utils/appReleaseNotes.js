const RELEASE_NOTES = [
    {
        version: '2026.07.10',
        date: '10/07/2026',
        title: 'Jornadas, clinica y rendimiento',
        changes: [
            'Rendicion multiple de jornadas desde historial.',
            'Correcciones para no ofrecer abrir jornada cuando ya fue abierta.',
            'Mejoras en clinica, pagos a proveedores y seguimiento de rendimiento.',
        ],
    },
    {
        version: '2026.06.01',
        date: '01/06/2026',
        title: 'Recuperacion operativa de jornada',
        changes: [
            'Apertura de jornada integrada en flujos de cobros, pagos y gastos.',
            'Avisos mas claros cuando la jornada financiera esta cerrada.',
        ],
    },
    {
        version: '2026.05.31',
        date: '31/05/2026',
        title: 'Base tecnica y optimizacion',
        changes: [
            'Nuevos documentos internos de auditoria, onboarding y backups.',
            'Estandares para rendimiento, replicas y despliegues por cliente.',
        ],
    },
]

export function getEditionLabel(tenantSlug = '') {
    return String(tenantSlug || '').trim().toLowerCase() === 'koeti' ? 'HESAKA Koeti' : 'HESAKA Web'
}

export function getReleaseNotes() {
    return RELEASE_NOTES
}
