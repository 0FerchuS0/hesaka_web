function sanitizeFilename(value, fallback = 'documento.pdf') {
    const trimmed = String(value || '').trim()
    if (!trimmed) return fallback
    return trimmed.replace(/[/\\?%*:|"<>]/g, '_')
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function decodeFilename(value) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

export function extractFilenameFromHeaders(headers, fallback = 'documento.pdf') {
    const disposition = headers?.['content-disposition'] || headers?.['Content-Disposition'] || ''
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match?.[1]) {
        return sanitizeFilename(decodeFilename(utf8Match[1]), fallback)
    }

    const simpleMatch = disposition.match(/filename="?([^";]+)"?/i)
    if (simpleMatch?.[1]) {
        return sanitizeFilename(simpleMatch[1], fallback)
    }

    return sanitizeFilename(fallback, fallback)
}

function buildLoadingHtml(message) {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(message)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0f172a;
      color: #e2e8f0;
      font-family: Arial, sans-serif;
    }
    .box {
      display: grid;
      gap: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="box">
    <strong>${escapeHtml(message)}</strong>
    <span>Preparando vista previa...</span>
  </div>
</body>
</html>`
}

function buildPdfPreviewHtml(blobUrl, fileName) {
    const safeFileName = escapeHtml(fileName)
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${safeFileName}</title>
  <style>
    :root {
      color-scheme: dark;
    }
    body {
      margin: 0;
      background: #0f172a;
      color: #e2e8f0;
      font-family: Arial, sans-serif;
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.22);
      background: #111827;
    }
    .title {
      font-weight: 700;
      line-height: 1.3;
      word-break: break-word;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 700;
      border: 1px solid rgba(59, 130, 246, 0.3);
      background: #2563eb;
      color: #fff;
    }
    .viewer {
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title">${safeFileName}</div>
    <div class="actions">
      <a class="action" href="${blobUrl}" download="${safeFileName}">Descargar PDF</a>
    </div>
  </div>
  <embed class="viewer" src="${blobUrl}" type="application/pdf" />
  <script>
    window.addEventListener('beforeunload', function () {
      try {
        URL.revokeObjectURL('${blobUrl}');
      } catch (error) {
        console.error(error);
      }
    });
  </script>
</body>
</html>`
}

function normalizeBlob(data, fallbackType) {
    if (data instanceof Blob) {
        if (data.type || !fallbackType) {
            return data
        }
        return data.slice(0, data.size, fallbackType)
    }
    return new Blob([data], { type: fallbackType || 'application/octet-stream' })
}

export function openPdfBlob(blob, fileName, previewWindow = null) {
    const targetWindow = previewWindow || window.open('', '_blank')
    if (!targetWindow) {
        throw new Error('El navegador bloqueo la apertura de la vista previa del PDF.')
    }

    const objectUrl = URL.createObjectURL(blob)
    targetWindow.document.open()
    targetWindow.document.write(buildPdfPreviewHtml(objectUrl, sanitizeFilename(fileName)))
    targetWindow.document.close()
    return targetWindow
}

export async function requestAndOpenPdf(requestFn, fallbackFilename = 'documento.pdf') {
    const previewWindow = window.open('', '_blank')
    if (previewWindow) {
        previewWindow.document.open()
        previewWindow.document.write(buildLoadingHtml('Generando PDF...'))
        previewWindow.document.close()
    }

    try {
        const response = await requestFn()
        const fileName = extractFilenameFromHeaders(response.headers, fallbackFilename)
        const blob = normalizeBlob(response.data, 'application/pdf')
        openPdfBlob(blob, fileName, previewWindow)
        return fileName
    } catch (error) {
        if (previewWindow && !previewWindow.closed) {
            previewWindow.close()
        }
        throw error
    }
}

export async function requestAndDownloadFile(requestFn, fallbackFilename, contentType) {
    const response = await requestFn()
    const fileName = extractFilenameFromHeaders(response.headers, fallbackFilename)
    const blob = normalizeBlob(response.data, contentType || response.data?.type || 'application/octet-stream')
    const objectUrl = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    return fileName
}
