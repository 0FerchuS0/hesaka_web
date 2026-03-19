import { api } from '../context/AuthContext'

export async function exportReportBlob(url, contentType, { openInNewTab = false } = {}) {
    const response = await api.get(url, { responseType: 'blob' })
    const blob = new Blob([response.data], { type: contentType })
    const objectUrl = window.URL.createObjectURL(blob)

    if (openInNewTab) {
        window.open(objectUrl, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000)
        return
    }

    const link = document.createElement('a')
    link.href = objectUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000)
}
