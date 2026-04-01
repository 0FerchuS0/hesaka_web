import { api } from '../context/AuthContext'
import { requestAndDownloadFile, requestAndOpenPdf } from './fileDownloads'

export async function exportReportBlob(url, contentType, { openInNewTab = false } = {}) {
    const normalizedContentType = String(contentType || '').toLowerCase()
    const isPdf = normalizedContentType.includes('pdf')

    if (isPdf || openInNewTab) {
        await requestAndOpenPdf(
            () => api.get(url, { responseType: 'blob' }),
            'documento.pdf',
        )
        return
    }

    await requestAndDownloadFile(
        () => api.get(url, { responseType: 'blob' }),
        'archivo',
        contentType,
    )
}
