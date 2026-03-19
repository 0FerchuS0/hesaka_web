export const formatCurrency = (value) => {
    if (value === null || value === undefined) return '0 Gs.'
    return new Intl.NumberFormat('es-PY', {
        style: 'currency',
        currency: 'PYG',
        maximumFractionDigits: 0
    }).format(value).replace(/\s/, ' ')
}

export const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-PY', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
}
