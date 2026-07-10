export function getTenantEditionSlug() {
    return import.meta.env.VITE_TENANT_SLUG || ''
}
