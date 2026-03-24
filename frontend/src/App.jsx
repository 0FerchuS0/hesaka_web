import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AuthProvider, useAuth, api } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import { hasModuleAccess, normalizeRole } from './utils/roles'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'))
const ConfiguracionGeneralPage = lazy(() => import('./pages/ConfiguracionGeneralPage'))
const ClientesPage = lazy(() => import('./pages/ClientesPage'))
const ReferidoresPage = lazy(() => import('./pages/ReferidoresPage'))
const VendedoresPage = lazy(() => import('./pages/VendedoresPage'))
const CanalesVentaPage = lazy(() => import('./pages/CanalesVentaPage'))
const CategoriasPage = lazy(() => import('./pages/CategoriasPage'))
const AtributosPage = lazy(() => import('./pages/AtributosPage'))
const MarcasPage = lazy(() => import('./pages/MarcasPage'))
const ProductosPage = lazy(() => import('./pages/ProductosPage'))
const ProveedoresPage = lazy(() => import('./pages/ProveedoresPage'))
const PresupuestosPage = lazy(() => import('./pages/PresupuestosPage'))
const VentasPage = lazy(() => import('./pages/VentasPage'))
const ComprasPage = lazy(() => import('./pages/ComprasPage'))
const CajaPage = lazy(() => import('./pages/CajaPage'))
const GastosPage = lazy(() => import('./pages/GastosPage'))
const CuentasPorPagarPage = lazy(() => import('./pages/CuentasPorPagarPage'))
const ReporteVentasPage = lazy(() => import('./pages/ReporteVentasPage'))
const ReporteComparativoMensualPage = lazy(() => import('./pages/ReporteComparativoMensualPage'))
const ReporteComprasPage = lazy(() => import('./pages/ReporteComprasPage'))
const ReporteFinanzasPage = lazy(() => import('./pages/ReporteFinanzasPage'))
const ReporteComisionesPage = lazy(() => import('./pages/ReporteComisionesPage'))
const ReporteSaldosClientesPage = lazy(() => import('./pages/ReporteSaldosClientesPage'))
const ReporteTrabajosLaboratorioPage = lazy(() => import('./pages/ReporteTrabajosLaboratorioPage'))
const ReporteAjustesVentasPage = lazy(() => import('./pages/ReporteAjustesVentasPage'))
const CobroMultiplePage = lazy(() => import('./pages/CobroMultiplePage'))
const HistorialCobrosMultiplesPage = lazy(() => import('./pages/HistorialCobrosMultiplesPage'))
const ClinicaPage = lazy(() => import('./pages/ClinicaPage'))

const Placeholder = ({ title, icon = '...' }) => (
    <div className="page-body">
        <div className="card">
            <div className="empty-state" style={{ padding: '80px 20px' }}>
                <div
                    style={{
                        fontSize: '3rem',
                        marginBottom: 16,
                        background: 'linear-gradient(135deg, #1a56db, #7c3aed)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}
                >
                    {icon}
                </div>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: 8 }}>
                    Modulo en desarrollo
                </h3>
                <p style={{ color: 'var(--text-muted)' }}>
                    El modulo <strong style={{ color: 'var(--primary-light)' }}>{title}</strong> sera implementado proximamente.
                </p>
            </div>
        </div>
    </div>
)

const RouteLoader = () => (
    <div className="page-body">
        <div className="card">
            <div className="empty-state" style={{ padding: '72px 20px' }}>
                <div className="spinner" style={{ width: 32, height: 32, marginBottom: 16 }} />
                <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 8 }}>Cargando modulo</h3>
                <p style={{ color: 'var(--text-muted)' }}>Estamos preparando la pantalla seleccionada.</p>
            </div>
        </div>
    </div>
)

const AccessDenied = () => (
    <div className="page-body">
        <div className="card">
            <div className="empty-state" style={{ padding: '72px 20px' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 8 }}>Acceso restringido</h3>
                <p style={{ color: 'var(--text-muted)' }}>
                    Su usuario no tiene permisos para entrar a este modulo.
                </p>
            </div>
        </div>
    </div>
)

function RoleRoute({ allowedRoles, children }) {
    const { user } = useAuth()
    return hasModuleAccess(user, allowedRoles) ? children : <AccessDenied />
}

function HomeRoute() {
    const { user } = useAuth()
    const role = normalizeRole(user?.rol)

    if (role === 'DOCTOR') {
        return <Navigate to="/clinica/dashboard" replace />
    }

    if (hasModuleAccess(user, 'dashboard')) {
        return <Dashboard />
    }

    if (hasModuleAccess(user, 'clinica')) {
        return <Navigate to="/clinica/dashboard" replace />
    }

    return <AccessDenied />
}

function AppLayout() {
    const { user } = useAuth()
    const location = useLocation()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = window.localStorage.getItem('hesaka-sidebar-collapsed')
        return saved === 'true'
    })

    const { data: estadoConfig, isLoading: loadingConfig } = useQuery({
        queryKey: ['configuracion-general-estado'],
        queryFn: () => api.get('/configuracion-general/estado').then(response => response.data),
        retry: false,
        staleTime: 60000,
    })

    useEffect(() => {
        window.localStorage.setItem('hesaka-sidebar-collapsed', String(sidebarCollapsed))
    }, [sidebarCollapsed])

    const role = normalizeRole(user?.rol)
    const configIncomplete = estadoConfig && !estadoConfig.configuracion_completa
    const inConfigRoute = location.pathname === '/configuracion-general'

    if (loadingConfig) {
        return (
            <div className="app-layout">
                <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(prev => !prev)} />
                <main className={`main-content ${sidebarCollapsed ? 'main-content--expanded' : ''}`}>
                    <RouteLoader />
                </main>
            </div>
        )
    }

    if (configIncomplete && !inConfigRoute && role === 'ADMIN') {
        return <Navigate to="/configuracion-general" replace />
    }

    if (configIncomplete && !inConfigRoute && role !== 'ADMIN') {
        return (
            <div className="app-layout">
                <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(prev => !prev)} />
                <main className={`main-content ${sidebarCollapsed ? 'main-content--expanded' : ''}`}>
                    <div className="page-body">
                        <div className="card">
                            <div className="empty-state" style={{ padding: '72px 20px' }}>
                                <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 8 }}>Configuracion pendiente</h3>
                                <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
                                    Un administrador debe completar primero la configuracion general de la optica para habilitar el resto del sistema.
                                </p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="app-layout">
            <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(prev => !prev)} />
            <main className={`main-content ${sidebarCollapsed ? 'main-content--expanded' : ''}`}>
                <Suspense fallback={<RouteLoader />}>
                    <Routes>
                        <Route path="/" element={<HomeRoute />} />
                        <Route path="/usuarios" element={<RoleRoute allowedRoles="usuarios"><UsuariosPage /></RoleRoute>} />
                        <Route path="/configuracion-general" element={<ConfiguracionGeneralPage />} />
                        <Route path="/clientes" element={<RoleRoute allowedRoles="catalogos"><ClientesPage /></RoleRoute>} />
                        <Route path="/clientes/saldos" element={<RoleRoute allowedRoles="reportes_financieros"><ReporteSaldosClientesPage /></RoleRoute>} />
                        <Route path="/referidores" element={<RoleRoute allowedRoles="catalogos"><ReferidoresPage /></RoleRoute>} />
                        <Route path="/vendedores" element={<RoleRoute allowedRoles="catalogos"><VendedoresPage /></RoleRoute>} />
                        <Route path="/canales-venta" element={<RoleRoute allowedRoles="catalogos"><CanalesVentaPage /></RoleRoute>} />
                        <Route path="/categorias" element={<RoleRoute allowedRoles="catalogos"><CategoriasPage /></RoleRoute>} />
                        <Route path="/atributos" element={<RoleRoute allowedRoles="catalogos"><AtributosPage /></RoleRoute>} />
                        <Route path="/marcas" element={<RoleRoute allowedRoles="catalogos"><MarcasPage /></RoleRoute>} />
                        <Route path="/productos" element={<RoleRoute allowedRoles="catalogos"><ProductosPage /></RoleRoute>} />
                        <Route path="/proveedores" element={<RoleRoute allowedRoles="catalogos"><ProveedoresPage /></RoleRoute>} />
                        <Route path="/presupuestos" element={<RoleRoute allowedRoles="presupuestos"><PresupuestosPage /></RoleRoute>} />
                        <Route path="/ventas" element={<RoleRoute allowedRoles="ventas"><VentasPage /></RoleRoute>} />
                        <Route path="/ventas/ajustes" element={<RoleRoute allowedRoles="ventas"><RouteErrorBoundary><ReporteAjustesVentasPage /></RouteErrorBoundary></RoleRoute>} />
                        <Route path="/compras" element={<RoleRoute allowedRoles="compras"><ComprasPage /></RoleRoute>} />
                        <Route path="/caja" element={<RoleRoute allowedRoles="finanzas"><CajaPage /></RoleRoute>} />
                        <Route path="/bancos" element={<Navigate to="/caja" replace />} />
                        <Route path="/ventas/cobro-multiple" element={<RoleRoute allowedRoles="cobros"><CobroMultiplePage /></RoleRoute>} />
                        <Route path="/ventas/historial-cobros-multiples" element={<RoleRoute allowedRoles="cobros"><HistorialCobrosMultiplesPage /></RoleRoute>} />
                        <Route path="/cuentas-por-pagar" element={<RoleRoute allowedRoles="cuentas_por_pagar"><CuentasPorPagarPage /></RoleRoute>} />
                        <Route path="/gastos" element={<RoleRoute allowedRoles="finanzas"><GastosPage /></RoleRoute>} />

                        <Route path="/reportes" element={<Navigate to="/reportes/ventas" replace />} />
                        <Route path="/reportes/ventas" element={<RoleRoute allowedRoles="reportes_comercial"><ReporteVentasPage /></RoleRoute>} />
                        <Route path="/reportes/comparativo-mensual" element={<RoleRoute allowedRoles="reportes_comercial"><ReporteComparativoMensualPage /></RoleRoute>} />
                        <Route path="/reportes/compras" element={<RoleRoute allowedRoles="reportes_comercial"><ReporteComprasPage /></RoleRoute>} />
                        <Route path="/reportes/ajustes-ventas" element={<Navigate to="/ventas/ajustes" replace />} />
                        <Route path="/reportes/finanzas" element={<RoleRoute allowedRoles="reportes_financieros"><ReporteFinanzasPage /></RoleRoute>} />
                        <Route path="/reportes/comisiones" element={<RoleRoute allowedRoles="reportes_financieros"><ReporteComisionesPage /></RoleRoute>} />
                        <Route path="/reportes/saldos" element={<Navigate to="/clientes/saldos" replace />} />
                        <Route path="/reportes/laboratorio" element={<RoleRoute allowedRoles="reportes_comercial"><ReporteTrabajosLaboratorioPage /></RoleRoute>} />
                        <Route path="/clinica" element={<Navigate to="/clinica/dashboard" replace />} />
                        <Route path="/clinica/dashboard" element={<RoleRoute allowedRoles="clinica"><ClinicaPage /></RoleRoute>} />
                        <Route path="/clinica/pacientes" element={<RoleRoute allowedRoles="clinica"><ClinicaPage /></RoleRoute>} />
                        <Route path="/clinica/doctores" element={<RoleRoute allowedRoles="clinica"><ClinicaPage /></RoleRoute>} />
                        <Route path="/clinica/consulta" element={<RoleRoute allowedRoles="clinica"><ClinicaPage /></RoleRoute>} />
                        <Route path="/clinica/historial" element={<RoleRoute allowedRoles="clinica"><ClinicaPage /></RoleRoute>} />
                        <Route path="/clinica/lugares" element={<RoleRoute allowedRoles="clinica"><ClinicaPage /></RoleRoute>} />
                        <Route path="/clinica/vademecum" element={<RoleRoute allowedRoles="clinica"><ClinicaPage /></RoleRoute>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </main>
        </div>
    )
}

function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth()
    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '100vh' }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
        )
    }
    return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route
                        path="/login"
                        element={
                            <Suspense fallback={<div className="flex-center" style={{ minHeight: '100vh' }}><div className="spinner" style={{ width: 40, height: 40 }} /></div>}>
                                <LoginPage />
                            </Suspense>
                        }
                    />
                    <Route
                        path="/*"
                        element={
                            <ProtectedRoute>
                                <AppLayout />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
