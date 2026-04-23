import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../context/AuthContext'

export const WHATSAPP_TEMPLATES_QUERY_KEY = ['whatsapp-templates-catalog']

export function useWhatsappTemplatesCatalog(options = {}) {
    return useQuery({
        queryKey: WHATSAPP_TEMPLATES_QUERY_KEY,
        queryFn: () => api.get('/configuracion-general/whatsapp-templates').then(response => response.data),
        staleTime: 60000,
        retry: false,
        ...options,
    })
}

export function useActualizarWhatsappTemplate() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ codigo, payload }) => api.put(`/configuracion-general/whatsapp-templates/${codigo}`, payload).then(response => response.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: WHATSAPP_TEMPLATES_QUERY_KEY })
        },
    })
}

export function getWhatsappTemplateByCode(templates, codigo, fallback) {
    const row = Array.isArray(templates) ? templates.find(item => item?.codigo === codigo) : null
    if (!row?.activo) return fallback
    return String(row.plantilla || '').trim() || fallback
}
