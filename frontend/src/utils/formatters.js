export const formatCurrency = (value) => {
    if (value === null || value === undefined) return '0 Gs.'
    return new Intl.NumberFormat('es-PY', {
        style: 'currency',
        currency: 'PYG',
        maximumFractionDigits: 0,
    }).format(value).replace(/\s/, ' ')
}

const BUSINESS_TIME_ZONE = 'America/Asuncion'

const getBusinessDateParts = (value = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    })

    const parts = formatter.formatToParts(value).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value
        return acc
    }, {})

    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
    }
}

export const parseBackendDateTime = (value) => {
    if (!value) return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

    const raw = String(value).trim()
    const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
    if (localMatch) {
        const [, y, m, d, hh = '00', mm = '00', ss = '00'] = localMatch
        const localDate = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss), 0)
        return Number.isNaN(localDate.getTime()) ? null : localDate
    }

    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = parseBackendDateTime(dateStr)
    if (!date) return '-'
    return date.toLocaleDateString('es-PY', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
}

export const formatDateTime = (dateStr) => {
    if (!dateStr) return '-'
    const date = parseBackendDateTime(dateStr)
    if (!date) return '-'
    return date.toLocaleString('es-PY')
}

export const toDateInputValue = (value) => {
    const date = parseBackendDateTime(value)
    if (!date) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export const toDateTimeLocalValue = (value) => {
    const date = parseBackendDateTime(value)
    if (!date) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
}

export const todayBusinessInputValue = () => {
    const { year, month, day } = getBusinessDateParts()
    return `${year}-${month}-${day}`
}

export const nowBusinessDateTimeLocalValue = () => {
    const { year, month, day, hour, minute } = getBusinessDateParts()
    return `${year}-${month}-${day}T${hour}:${minute}`
}

export const formatCurrentBusinessDate = (locale = 'es-PY', options = {}) =>
    new Intl.DateTimeFormat(locale, { timeZone: BUSINESS_TIME_ZONE, ...options }).format(new Date())
