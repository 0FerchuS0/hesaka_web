const gsFormatter = new Intl.NumberFormat('es-PY')

export function parseGsInput(value) {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (!digits) return 0
    return Number.parseInt(digits, 10) || 0
}

export function formatGsAmount(value) {
    const amount = Math.max(0, Math.trunc(Number(value) || 0))
    if (!amount) return ''
    return gsFormatter.format(amount)
}

export function normalizeGsInput(value, max = null) {
    const parsed = parseGsInput(value)
    const limit = max === null ? null : Math.max(0, Math.trunc(Number(max) || 0))
    const amount = limit === null ? parsed : Math.min(parsed, limit)
    return {
        amount,
        formatted: formatGsAmount(amount),
    }
}
