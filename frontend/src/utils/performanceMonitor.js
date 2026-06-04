const STORAGE_KEY = 'hesaka-performance-report-v1'
const PENDING_KEY = 'hesaka-performance-pending-v1'
const MAX_ENTRIES = 1000

function safeParse(value, fallback) {
    if (!value) return fallback
    try {
        return JSON.parse(value)
    } catch {
        return fallback
    }
}

function getNowIso() {
    return new Date().toISOString()
}

function readUserSnapshot() {
    if (typeof window === 'undefined') return null
    const user = safeParse(window.localStorage.getItem('hesaka_user'), null)
    if (!user) return null
    return {
        id: user.id ?? null,
        nombre: user.nombre_completo || user.nombre || user.email || 'Usuario',
        rol: user.rol || null,
        email: user.email || null,
    }
}

function readEntries() {
    if (typeof window === 'undefined') return []
    return safeParse(window.localStorage.getItem(STORAGE_KEY), [])
}

function writeEntries(entries) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
    window.dispatchEvent(new CustomEvent('hesaka:performance-report-updated'))
}

function clearPendingTrace(traceId) {
    if (typeof window === 'undefined') return
    const pending = safeParse(window.sessionStorage.getItem(PENDING_KEY), null)
    if (!pending) return
    if (!traceId || pending.id === traceId) {
        window.sessionStorage.removeItem(PENDING_KEY)
    }
}

function cloneTrace(trace) {
    return {
        ...trace,
        metadata: { ...(trace.metadata || {}) },
        steps: Array.isArray(trace.steps) ? trace.steps.map(step => ({ ...step, metadata: { ...(step.metadata || {}) } })) : [],
    }
}

export function waitForNextPaint() {
    return new Promise(resolve => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                window.setTimeout(resolve, 0)
            })
        })
    })
}

export function startTrackedFlow({ flowKey, label, metadata = {}, persistAcrossNavigation = false }) {
    const startedAtIso = getNowIso()
    const trace = {
        id: `${flowKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        flowKey,
        label,
        startedAtIso,
        startedAtMs: Date.now(),
        startPerfMs: performance.now(),
        finishedAtIso: null,
        durationMs: null,
        outcome: 'pending',
        user: readUserSnapshot(),
        metadata: { ...metadata },
        steps: [],
    }

    markFlowStep(trace, 'inicio', 'Inicio del flujo')

    if (persistAcrossNavigation && typeof window !== 'undefined') {
        window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(cloneTrace(trace)))
    }

    return trace
}

export function markFlowStep(trace, stepKey, label, metadata = {}) {
    if (!trace || trace.outcome !== 'pending') return trace
    const perfMs = performance.now()
    const elapsedMs = Math.round(perfMs - trace.startPerfMs)
    const previousElapsed = trace.steps.length ? trace.steps[trace.steps.length - 1].elapsedMs : 0
    trace.steps.push({
        key: stepKey,
        label,
        atIso: getNowIso(),
        elapsedMs,
        deltaMs: elapsedMs - previousElapsed,
        metadata: { ...metadata },
    })
    return trace
}

export function completeTrackedFlow(trace, { metadata = {} } = {}) {
    if (!trace || trace.outcome !== 'pending') return trace
    const completed = cloneTrace(trace)
    completed.finishedAtIso = getNowIso()
    completed.durationMs = Math.round(performance.now() - trace.startPerfMs)
    completed.outcome = 'success'
    completed.metadata = { ...(trace.metadata || {}), ...metadata }

    const entries = readEntries()
    entries.push(completed)
    writeEntries(entries)
    clearPendingTrace(trace.id)
    return completed
}

export function failTrackedFlow(trace, { error, metadata = {} } = {}) {
    if (!trace || trace.outcome !== 'pending') return trace
    const failed = cloneTrace(trace)
    failed.finishedAtIso = getNowIso()
    failed.durationMs = Math.round(performance.now() - trace.startPerfMs)
    failed.outcome = 'error'
    failed.metadata = {
        ...(trace.metadata || {}),
        ...metadata,
        error: typeof error === 'string'
            ? error
            : (error?.response?.data?.detail || error?.message || 'Error no especificado'),
    }

    const entries = readEntries()
    entries.push(failed)
    writeEntries(entries)
    clearPendingTrace(trace.id)
    return failed
}

export function consumePendingTrackedFlow(flowKey = null) {
    if (typeof window === 'undefined') return null
    const pending = safeParse(window.sessionStorage.getItem(PENDING_KEY), null)
    if (!pending) return null
    if (flowKey && pending.flowKey !== flowKey) return null
    clearPendingTrace(pending.id)
    return pending
}

export function getPerformanceEntries() {
    return readEntries().slice().sort((a, b) => (b.startedAtMs || 0) - (a.startedAtMs || 0))
}

export function clearPerformanceEntries() {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('hesaka:performance-report-updated'))
}

function csvEscape(value) {
    const text = String(value ?? '')
    if (/[",\n]/.test(text)) {
        return `"${text.replaceAll('"', '""')}"`
    }
    return text
}

function downloadBlob(filename, blob, type) {
    if (typeof window === 'undefined') return
    const file = new Blob([blob], { type })
    const url = window.URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1500)
}

export function exportPerformanceReportJson() {
    const entries = getPerformanceEntries()
    downloadBlob(
        `hesaka_rendimiento_${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(entries, null, 2),
        'application/json',
    )
}

export function exportPerformanceReportCsv() {
    const rows = [
        [
            'fecha_inicio',
            'fecha_fin',
            'flujo',
            'etiqueta',
            'resultado',
            'duracion_ms',
            'usuario',
            'rol',
            'metadata',
            'pasos',
        ].join(','),
    ]

    getPerformanceEntries().forEach(entry => {
        rows.push([
            csvEscape(entry.startedAtIso),
            csvEscape(entry.finishedAtIso),
            csvEscape(entry.flowKey),
            csvEscape(entry.label),
            csvEscape(entry.outcome),
            csvEscape(entry.durationMs),
            csvEscape(entry.user?.nombre || ''),
            csvEscape(entry.user?.rol || ''),
            csvEscape(JSON.stringify(entry.metadata || {})),
            csvEscape(JSON.stringify(entry.steps || [])),
        ].join(','))
    })

    downloadBlob(
        `hesaka_rendimiento_${new Date().toISOString().slice(0, 10)}.csv`,
        rows.join('\n'),
        'text/csv;charset=utf-8',
    )
}

export function summarizePerformanceEntries(entries = getPerformanceEntries()) {
    const summaryMap = new Map()

    entries.forEach(entry => {
        const current = summaryMap.get(entry.flowKey) || {
            flowKey: entry.flowKey,
            label: entry.label,
            count: 0,
            successCount: 0,
            errorCount: 0,
            totalDurationMs: 0,
            minDurationMs: null,
            maxDurationMs: 0,
        }

        current.count += 1
        if (entry.outcome === 'success') current.successCount += 1
        if (entry.outcome === 'error') current.errorCount += 1
        current.totalDurationMs += Number(entry.durationMs || 0)
        current.minDurationMs = current.minDurationMs == null
            ? Number(entry.durationMs || 0)
            : Math.min(current.minDurationMs, Number(entry.durationMs || 0))
        current.maxDurationMs = Math.max(current.maxDurationMs, Number(entry.durationMs || 0))
        summaryMap.set(entry.flowKey, current)
    })

    return Array.from(summaryMap.values())
        .map(item => ({
            ...item,
            avgDurationMs: item.count ? Math.round(item.totalDurationMs / item.count) : 0,
        }))
        .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
}
