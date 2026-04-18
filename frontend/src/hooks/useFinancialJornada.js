import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../context/AuthContext'

function buildHistorialRendicionesQuery(params = {}) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return
        searchParams.set(key, String(value))
    })
    return searchParams.toString()
}

export function useFinancialJornadaStatus() {
    return useQuery({
        queryKey: ['jornada-financiera-actual'],
        queryFn: () => api.get('/caja/jornada/estado-actual').then(response => response.data),
        retry: false,
        staleTime: 30000,
    })
}

export function useAbrirJornada() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: payload => api.post('/caja/jornada/abrir', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jornada-financiera-actual'] })
            queryClient.invalidateQueries({ queryKey: ['saldo-caja'] })
            queryClient.invalidateQueries({ queryKey: ['movimientos-caja'] })
            queryClient.invalidateQueries({ queryKey: ['bancos'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-jornadas'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-rendiciones'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-alerta-post-corte-anterior'] })
        },
    })
}

export function useCortesJornadaActual() {
    return useQuery({
        queryKey: ['jornada-financiera-cortes'],
        queryFn: () => api.get('/caja/jornada/cortes').then(response => response.data),
        retry: false,
        staleTime: 30000,
    })
}

export function useCrearCorteJornada() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: () => api.post('/caja/jornada/cortes'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jornada-financiera-actual'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-financiera-cortes'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-jornadas'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-alerta-post-corte-anterior'] })
        },
    })
}

export function useMovimientosPosterioresUltimoCorte() {
    return useQuery({
        queryKey: ['jornada-alerta-post-corte-anterior'],
        queryFn: () => api.get('/caja/jornada/alerta-post-corte-anterior').then(response => response.data),
        retry: false,
        staleTime: 30000,
    })
}

export function usePendienteRendicion() {
    return useQuery({
        queryKey: ['jornada-pendiente-rendicion'],
        queryFn: () => api.get('/caja/jornada/pendiente-rendir').then(response => response.data),
        retry: false,
        staleTime: 30000,
    })
}

export function useRendicionesJornadaActual() {
    return useQuery({
        queryKey: ['jornada-rendiciones'],
        queryFn: () => api.get('/caja/jornada/rendiciones').then(response => response.data),
        retry: false,
        staleTime: 30000,
    })
}

export function useCrearRendicionJornada() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: payload => api.post('/caja/jornada/rendiciones', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jornada-financiera-actual'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-rendiciones'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-pendiente-rendicion'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-jornadas'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-rendiciones'] })
        },
    })
}

export function useCrearRendicionJornadaHistorial(jornadaId) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: payload => api.post(`/caja/jornada/${jornadaId}/rendiciones`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jornada-financiera-actual'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-rendiciones'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-pendiente-rendicion'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-jornadas'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-rendiciones'] })
        },
    })
}

export function usePendienteRendicionHistorial(jornadaId) {
    return useQuery({
        queryKey: ['jornada-pendiente-rendicion-historial', jornadaId],
        queryFn: () => api.get(`/caja/jornada/${jornadaId}/pendiente-rendir`).then(response => response.data),
        enabled: !!jornadaId,
        retry: false,
        staleTime: 15000,
    })
}

export function useEditarRendicionJornada() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ rendicionId, payload }) => api.patch(`/caja/jornada/rendiciones/${rendicionId}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jornada-financiera-actual'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-rendiciones'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-pendiente-rendicion'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-jornadas'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-rendiciones'] })
        },
    })
}

export function useHistorialJornadas(limit = 15) {
    return useQuery({
        queryKey: ['jornada-historial-jornadas', limit],
        queryFn: () => api.get(`/caja/jornada/historial/jornadas?limit=${limit}`).then(response => response.data),
        retry: false,
        staleTime: 30000,
        refetchOnMount: 'always',
    })
}

export function useHistorialRendiciones(params = {}, options = {}) {
    const query = buildHistorialRendicionesQuery(params)
    return useQuery({
        queryKey: ['jornada-historial-rendiciones', query],
        queryFn: () => api.get(`/caja/jornada/historial/rendiciones?${query}`).then(response => response.data),
        enabled: options.enabled ?? true,
        retry: false,
        staleTime: 15000,
    })
}

export function useRendicionDetalle(rendicionId) {
    return useQuery({
        queryKey: ['jornada-rendicion-detalle', rendicionId],
        queryFn: () => api.get(`/caja/jornada/rendiciones/${rendicionId}`).then(response => response.data),
        enabled: !!rendicionId,
        retry: false,
        staleTime: 30000,
    })
}

export function useOpcionesFiltrosRendiciones() {
    return useQuery({
        queryKey: ['jornada-rendiciones-filtros-opciones'],
        queryFn: () => api.get('/caja/jornada/historial/filtros-opciones').then(response => response.data),
        retry: false,
        staleTime: 60000,
    })
}

export function useDestinatariosRendicionCatalog() {
    return useQuery({
        queryKey: ['jornada-destinatarios-rendicion'],
        queryFn: () => api.get('/caja/jornada/destinatarios-rendicion').then(response => response.data),
        retry: false,
        staleTime: 60000,
    })
}

export function useCrearDestinatarioRendicion() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: payload => api.post('/caja/jornada/destinatarios-rendicion', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jornada-destinatarios-rendicion'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-rendiciones-filtros-opciones'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-rendiciones'] })
        },
    })
}

export function useActualizarDestinatarioRendicion() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, payload }) => api.patch(`/caja/jornada/destinatarios-rendicion/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jornada-destinatarios-rendicion'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-rendiciones-filtros-opciones'] })
            queryClient.invalidateQueries({ queryKey: ['jornada-historial-rendiciones'] })
        },
    })
}
