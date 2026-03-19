export function normalizeRole(role) {
    const rawRole = String(role || '').toUpperCase()
    const aliases = {
        USUARIO: 'OPERADOR',
        CLINICA: 'DOCTOR',
    }
    return aliases[rawRole] || rawRole
}

export const moduleRoles = {
    dashboard: ['ADMIN', 'OPERADOR', 'CAJERO', 'DOCTOR'],
    usuarios: ['ADMIN'],
    presupuestos: ['ADMIN', 'OPERADOR', 'CAJERO'],
    ventas: ['ADMIN', 'OPERADOR', 'CAJERO'],
    cobros: ['ADMIN', 'CAJERO'],
    compras: ['ADMIN', 'OPERADOR', 'CAJERO'],
    catalogos: ['ADMIN', 'OPERADOR', 'CAJERO'],
    finanzas: ['ADMIN', 'CAJERO'],
    cuentas_por_pagar: ['ADMIN', 'CAJERO'],
    reportes_comercial: ['ADMIN', 'OPERADOR', 'CAJERO'],
    reportes_financieros: ['ADMIN', 'CAJERO'],
    clinica: ['ADMIN', 'DOCTOR'],
}

export const actionRoles = {
    'usuarios.crear': ['ADMIN'],
    'usuarios.password': ['ADMIN'],
    'usuarios.permisos': ['ADMIN'],
    'usuarios.estado': ['ADMIN'],

    'presupuestos.crear': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'presupuestos.editar': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'presupuestos.eliminar': ['ADMIN', 'OPERADOR'],
    'presupuestos.exportar': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'presupuestos.convertir': ['ADMIN', 'OPERADOR', 'CAJERO'],

    'ventas.cobrar': ['ADMIN', 'CAJERO'],
    'ventas.revertir': ['ADMIN', 'CAJERO'],
    'ventas.anular': ['ADMIN'],
    'ventas.ajustar': ['ADMIN', 'CAJERO'],
    'ventas.exportar': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'ventas.entrega': ['ADMIN', 'OPERADOR', 'CAJERO'],

    'compras.crear': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'compras.editar': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'compras.pagar': ['ADMIN', 'CAJERO'],
    'compras.anular': ['ADMIN'],
    'compras.exportar': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'compras.entrega': ['ADMIN', 'OPERADOR', 'CAJERO'],

    'catalogos.crear': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'catalogos.editar': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'catalogos.eliminar': ['ADMIN'],

    'finanzas.transferencias': ['ADMIN', 'CAJERO'],
    'finanzas.conciliar': ['ADMIN', 'CAJERO'],
    'finanzas.editar_cuentas': ['ADMIN', 'CAJERO'],

    'cuentas_por_pagar.pagar': ['ADMIN', 'CAJERO'],
    'cuentas_por_pagar.revertir': ['ADMIN', 'CAJERO'],
    'cuentas_por_pagar.editar': ['ADMIN', 'CAJERO'],
    'cuentas_por_pagar.exportar': ['ADMIN', 'CAJERO'],

    'reportes_comercial.exportar': ['ADMIN', 'OPERADOR', 'CAJERO'],
    'reportes_financieros.exportar': ['ADMIN', 'CAJERO'],
    'clinica.dashboard': ['ADMIN', 'DOCTOR'],
    'clinica.pacientes': ['ADMIN', 'DOCTOR'],
    'clinica.pacientes_crear': ['ADMIN', 'DOCTOR'],
    'clinica.pacientes_editar': ['ADMIN', 'DOCTOR'],
    'clinica.consultas_ver': ['ADMIN', 'DOCTOR'],
    'clinica.consultas_crear': ['ADMIN', 'DOCTOR'],
    'clinica.consultas_editar': ['ADMIN', 'DOCTOR'],
    'clinica.consultas_exportar': ['ADMIN', 'DOCTOR'],
    'clinica.doctores': ['ADMIN', 'DOCTOR'],
    'clinica.doctores_editar': ['ADMIN', 'DOCTOR'],
    'clinica.lugares': ['ADMIN', 'DOCTOR'],
    'clinica.vademecum': ['ADMIN', 'DOCTOR'],
    'clinica.recetas_exportar': ['ADMIN', 'DOCTOR'],
    'clinica.historial': ['ADMIN', 'DOCTOR'],
    'clinica.convertir_cliente': ['ADMIN', 'DOCTOR'],
}

export const permissionCatalog = [
    {
        group: 'Principal',
        items: [
            { key: 'dashboard', label: 'Dashboard' },
            {
                key: 'usuarios',
                label: 'Usuarios y Roles',
                actions: [
                    { key: 'usuarios.crear', label: 'Crear usuarios' },
                    { key: 'usuarios.password', label: 'Cambiar contrasenas' },
                    { key: 'usuarios.permisos', label: 'Editar permisos' },
                    { key: 'usuarios.estado', label: 'Activar / desactivar usuarios' },
                ],
            },
        ],
    },
    {
        group: 'Comercial',
        items: [
            {
                key: 'presupuestos',
                label: 'Presupuestos',
                actions: [
                    { key: 'presupuestos.crear', label: 'Crear presupuestos' },
                    { key: 'presupuestos.editar', label: 'Editar presupuestos' },
                    { key: 'presupuestos.eliminar', label: 'Eliminar presupuestos' },
                    { key: 'presupuestos.convertir', label: 'Convertir a venta' },
                    { key: 'presupuestos.exportar', label: 'Exportar presupuestos' },
                ],
            },
            {
                key: 'ventas',
                label: 'Ventas',
                actions: [
                    { key: 'ventas.cobrar', label: 'Cobrar ventas' },
                    { key: 'ventas.revertir', label: 'Revertir cobros' },
                    { key: 'ventas.ajustar', label: 'Ajustar ventas' },
                    { key: 'ventas.anular', label: 'Anular ventas' },
                    { key: 'ventas.entrega', label: 'Marcar / deshacer entrega' },
                    { key: 'ventas.exportar', label: 'Exportar / PDF ventas' },
                ],
            },
            { key: 'cobros', label: 'Cobro multiple / historial de cobros' },
            {
                key: 'compras',
                label: 'Compras',
                actions: [
                    { key: 'compras.crear', label: 'Crear compras' },
                    { key: 'compras.editar', label: 'Editar compras' },
                    { key: 'compras.pagar', label: 'Gestionar pagos' },
                    { key: 'compras.anular', label: 'Anular / eliminar compras' },
                    { key: 'compras.entrega', label: 'Cambiar entrega' },
                    { key: 'compras.exportar', label: 'Exportar / PDF compras' },
                ],
            },
        ],
    },
    {
        group: 'Catalogos',
        items: [
            {
                key: 'catalogos',
                label: 'Catalogos base',
                actions: [
                    { key: 'catalogos.crear', label: 'Crear registros' },
                    { key: 'catalogos.editar', label: 'Editar registros' },
                    { key: 'catalogos.eliminar', label: 'Eliminar registros' },
                ],
            },
        ],
    },
    {
        group: 'Finanzas',
        items: [
            {
                key: 'finanzas',
                label: 'Centro financiero y gastos',
                actions: [
                    { key: 'finanzas.transferencias', label: 'Transferencias internas' },
                    { key: 'finanzas.conciliar', label: 'Conciliar transferencias' },
                    { key: 'finanzas.editar_cuentas', label: 'Editar cuentas bancarias' },
                ],
            },
            {
                key: 'cuentas_por_pagar',
                label: 'Cuentas por pagar',
                actions: [
                    { key: 'cuentas_por_pagar.pagar', label: 'Pagar proveedor' },
                    { key: 'cuentas_por_pagar.editar', label: 'Editar pagos a proveedor' },
                    { key: 'cuentas_por_pagar.revertir', label: 'Revertir pagos' },
                    { key: 'cuentas_por_pagar.exportar', label: 'Exportar / PDF / Excel' },
                ],
            },
        ],
    },
    {
        group: 'Reportes',
        items: [
            {
                key: 'reportes_comercial',
                label: 'Reportes comerciales',
                actions: [
                    { key: 'reportes_comercial.exportar', label: 'Exportar reportes comerciales' },
                ],
            },
            {
                key: 'reportes_financieros',
                label: 'Reportes financieros',
                actions: [
                    { key: 'reportes_financieros.exportar', label: 'Exportar reportes financieros' },
                ],
            },
        ],
    },
    {
        group: 'Clinica',
        items: [
            {
                key: 'clinica',
                label: 'Modulo clinico',
                actions: [
                    { key: 'clinica.dashboard', label: 'Dashboard clinico' },
                    { key: 'clinica.pacientes', label: 'Ver pacientes' },
                    { key: 'clinica.pacientes_crear', label: 'Crear pacientes' },
                    { key: 'clinica.pacientes_editar', label: 'Editar pacientes' },
                    { key: 'clinica.consultas_ver', label: 'Ver consultas' },
                    { key: 'clinica.consultas_crear', label: 'Crear consultas' },
                    { key: 'clinica.consultas_editar', label: 'Editar consultas' },
                    { key: 'clinica.consultas_exportar', label: 'Exportar consultas' },
                    { key: 'clinica.doctores', label: 'Ver doctores' },
                    { key: 'clinica.doctores_editar', label: 'Editar doctores' },
                    { key: 'clinica.lugares', label: 'Gestionar lugares de atencion' },
                    { key: 'clinica.vademecum', label: 'Gestionar vademecum' },
                    { key: 'clinica.recetas_exportar', label: 'Exportar recetas' },
                    { key: 'clinica.historial', label: 'Ver historial clinico' },
                    { key: 'clinica.convertir_cliente', label: 'Convertir paciente a cliente' },
                ],
            },
        ],
    },
]

export function defaultPermissionsForRole(role) {
    const currentRole = normalizeRole(role)
    return Object.entries(moduleRoles)
        .filter(([, roles]) => roles.map(normalizeRole).includes(currentRole))
        .map(([key]) => key)
}

export function defaultActionPermissionsForRole(role) {
    const currentRole = normalizeRole(role)
    return Object.entries(actionRoles)
        .filter(([, roles]) => roles.map(normalizeRole).includes(currentRole))
        .map(([key]) => key)
}

export function getExplicitPermissions(user) {
    return Array.isArray(user?.permisos) ? user.permisos : []
}

function getExplicitActionPermissions(user) {
    return getExplicitPermissions(user).filter(item => item.includes('.'))
}

export function getEffectivePermissions(user) {
    if (!user) return []
    if (normalizeRole(user.rol) === 'ADMIN') return Object.keys(moduleRoles)
    const explicitPermissions = getExplicitPermissions(user).filter(item => !item.includes('.'))
    return explicitPermissions.length > 0 ? explicitPermissions : defaultPermissionsForRole(user.rol)
}

export function getEffectiveActionPermissions(user) {
    if (!user) return []
    if (normalizeRole(user.rol) === 'ADMIN') return Object.keys(actionRoles)
    const explicitActionPermissions = getExplicitActionPermissions(user)
    return explicitActionPermissions.length > 0 ? explicitActionPermissions : defaultActionPermissionsForRole(user.rol)
}

export function hasModuleAccess(user, moduleKey) {
    return getEffectivePermissions(user).includes(moduleKey)
}

export function hasActionAccess(user, actionKey, fallbackModuleKey = null) {
    if (!user) return false
    if (normalizeRole(user.rol) === 'ADMIN') return true
    if (fallbackModuleKey && !hasModuleAccess(user, fallbackModuleKey)) return false

    const explicitPermissions = getExplicitPermissions(user)
    const explicitActionPermissions = getExplicitActionPermissions(user)

    if (explicitActionPermissions.length > 0) {
        return explicitActionPermissions.includes(actionKey)
    }

    if (explicitPermissions.length > 0 && fallbackModuleKey) {
        return explicitPermissions.includes(fallbackModuleKey)
    }

    return getEffectiveActionPermissions(user).includes(actionKey)
}
