import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasModuleAccess } from '../utils/roles'
import {
    LayoutDashboard,
    Package,
    Users,
    ShoppingCart,
    FileText,
    TrendingUp,
    DollarSign,
    CreditCard,
    BarChart2,
    Stethoscope,
    LogOut,
    Building2,
    ChevronDown,
    ChevronRight,
    UserRoundPlus,
    FolderTree,
    Layers3,
    Tag,
    Landmark,
    Shield,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react'

const navGroups = [
    {
        title: 'Principal',
        accent: '#60a5fa',
        tint: 'rgba(96, 165, 250, 0.08)',
        items: [
            { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
            { to: '/usuarios', icon: Shield, label: 'Usuarios' },
        ]
    },
    {
        title: 'Comercial',
        accent: '#34d399',
        tint: 'rgba(52, 211, 153, 0.08)',
        items: [
            { to: '/presupuestos', icon: FileText, label: 'Presupuestos' },
            {
                to: '/ventas',
                icon: TrendingUp,
                label: 'Ventas',
                subItems: [
                    { to: '/ventas', label: 'Ventas Realizadas' },
                    { to: '/ventas/ajustes', label: 'Ajustes de Venta' },
                    { to: '/ventas/cobro-multiple', label: 'Cobro Multiple' },
                    { to: '/ventas/historial-cobros-multiples', label: 'Historial de Cobros' },
                ]
            },
            { to: '/compras', icon: ShoppingCart, label: 'Compras' },
        ]
    },
    {
        title: 'Catalogos',
        accent: '#fbbf24',
        tint: 'rgba(251, 191, 36, 0.08)',
        items: [
            {
                to: '/clientes',
                icon: Users,
                label: 'Clientes',
                subItems: [
                    { to: '/clientes', label: 'Listado de Clientes' },
                    { to: '/clientes/saldos', label: 'Saldos Clientes' },
                ]
            },
            { to: '/referidores', icon: UserRoundPlus, label: 'Referidores' },
            { to: '/categorias', icon: FolderTree, label: 'Categorias' },
            { to: '/atributos', icon: Layers3, label: 'Atributos' },
            { to: '/marcas', icon: Tag, label: 'Marcas' },
            { to: '/productos', icon: Package, label: 'Productos' },
            { to: '/proveedores', icon: Building2, label: 'Proveedores' },
        ]
    },
    {
        title: 'Finanzas',
        accent: '#f472b6',
        tint: 'rgba(244, 114, 182, 0.08)',
        items: [
            { to: '/caja', icon: Landmark, label: 'Centro Financiero' },
            { to: '/gastos', icon: DollarSign, label: 'Gastos' },
            { to: '/cuentas-por-pagar', icon: Landmark, label: 'Cuentas por Pagar' },
        ]
    },
    {
        title: 'Reportes',
        accent: '#a78bfa',
        tint: 'rgba(167, 139, 250, 0.08)',
        items: [
            {
                to: '/reportes',
                icon: BarChart2,
                label: 'Centro',
                subItems: [
                    { to: '/reportes/ventas', label: 'Ventas y Rentabilidad' },
                    { to: '/reportes/comparativo-mensual', label: 'Comparativo Mensual' },
                    { to: '/reportes/compras', label: 'Compras y Proveedores' },
                    { to: '/reportes/laboratorio', label: 'Trabajos Laboratorio' },
                    { to: '/reportes/finanzas', label: 'Financiero / Caja' },
                    { to: '/reportes/comisiones', label: 'Comisiones' }
                ]
            },
        ]
    },
    {
        title: 'Clinica',
        accent: '#22d3ee',
        tint: 'rgba(34, 211, 238, 0.08)',
        items: [
            {
                to: '/clinica',
                icon: Stethoscope,
                label: 'Modulo Clinico',
                subItems: [
                    { to: '/clinica/dashboard', label: 'Dashboard Clinico' },
                    { to: '/clinica/pacientes', label: 'Pacientes' },
                    { to: '/clinica/doctores', label: 'Doctores' },
                    { to: '/clinica/consulta', label: 'Nueva Consulta' },
                    { to: '/clinica/historial', label: 'Historial' },
                    { to: '/clinica/lugares', label: 'Lugares' },
                    { to: '/clinica/vademecum', label: 'Vademecum' },
                ]
            },
        ]
    },
]

export default function Sidebar({ collapsed = false, onToggle }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    const [openMenus, setOpenMenus] = useState(() => {
        const initialState = {}
        navGroups.forEach(g => g.items.forEach(item => {
            if (item.subItems && location.pathname.startsWith(item.to)) {
                initialState[item.to] = true
            }
        }))
        return initialState
    })

    const toggleMenu = (e, path) => {
        e.preventDefault()
        setOpenMenus(prev => ({ ...prev, [path]: !prev[path] }))
    }

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const filteredGroups = navGroups
        .map(group => ({
            ...group,
            items: group.items
                .map(item => {
                    if (item.to === '/') {
                        return hasModuleAccess(user, 'dashboard') ? item : null
                    }
                    if (item.to === '/usuarios') {
                        return hasModuleAccess(user, 'usuarios') ? item : null
                    }
                    if (item.to === '/presupuestos') {
                        return hasModuleAccess(user, 'presupuestos') ? item : null
                    }
                    if (item.to === '/ventas') {
                        if (!hasModuleAccess(user, 'ventas')) return null
                        const subItems = (item.subItems || []).filter(sub => {
                            if (sub.to === '/ventas/cobro-multiple' || sub.to === '/ventas/historial-cobros-multiples') {
                                return hasModuleAccess(user, 'cobros')
                            }
                            return true
                        })
                        return { ...item, subItems }
                    }
                    if (item.to === '/compras') return hasModuleAccess(user, 'compras') ? item : null
                    if (item.to === '/clientes') {
                        if (!hasModuleAccess(user, 'catalogos')) return null
                        const subItems = (item.subItems || []).filter(sub => {
                            if (sub.to === '/clientes/saldos') {
                                return hasModuleAccess(user, 'reportes_financieros')
                            }
                            return true
                        })
                        return { ...item, subItems }
                    }
                    if (['/referidores', '/categorias', '/atributos', '/marcas', '/productos', '/proveedores'].includes(item.to)) {
                        return hasModuleAccess(user, 'catalogos') ? item : null
                    }
                    if (['/caja', '/gastos'].includes(item.to)) {
                        return hasModuleAccess(user, 'finanzas') ? item : null
                    }
                    if (item.to === '/cuentas-por-pagar') {
                        return hasModuleAccess(user, 'cuentas_por_pagar') ? item : null
                    }
                    if (item.to === '/reportes') {
                        const subItems = (item.subItems || []).filter(sub => {
                            if (['/reportes/ventas', '/reportes/comparativo-mensual', '/reportes/compras'].includes(sub.to)) {
                                return hasModuleAccess(user, 'reportes_comercial')
                            }
                            if (sub.to === '/reportes/laboratorio') {
                                return hasModuleAccess(user, 'reportes_comercial')
                            }
                            if (['/reportes/finanzas', '/reportes/comisiones'].includes(sub.to)) {
                                return hasModuleAccess(user, 'reportes_financieros')
                            }
                            return false
                        })
                        return subItems.length > 0 ? { ...item, subItems } : null
                    }
                    if (item.to === '/clinica') return hasModuleAccess(user, 'clinica') ? item : null
                    return item
                })
                .filter(Boolean)
        }))
        .filter(group => group.items.length > 0)

    const displayName = user?.nombre_completo || user?.nombre || 'Usuario'
    const initials = displayName.split(' ').map(n => n[0]).slice(0, 2).join('') || 'U'

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">H</div>
                {!collapsed && (
                    <div className="sidebar-logo-text">
                    <span>HESAKA Web</span>
                    <span>Sistema de Gestion</span>
                    </div>
                )}
                <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={onToggle}
                    title={collapsed ? 'Mostrar menu lateral' : 'Ocultar menu lateral'}
                >
                    {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
            </div>

            <nav className="sidebar-nav">
                {filteredGroups.map((group) => (
                    <div
                        key={group.title}
                        className="sidebar-group"
                        style={{ '--group-accent': group.accent, '--group-tint': group.tint }}
                    >
                        {!collapsed && <div className="sidebar-section-title">{group.title}</div>}
                        {group.items.map((item) => (
                            <div key={item.to}>
                                {item.subItems ? (
                                    <>
                                        <button
                                            className={`sidebar-item ${location.pathname.startsWith(item.to) ? 'active' : ''}`}
                                            onClick={(e) => toggleMenu(e, item.to)}
                                            style={{ width: '100%', display: 'flex', justifyContent: collapsed ? 'center' : 'space-between' }}
                                            title={collapsed ? item.label : undefined}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <item.icon size={18} />
                                                {!collapsed && item.label}
                                            </div>
                                            {!collapsed && (openMenus[item.to] ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                                        </button>

                                        {!collapsed && openMenus[item.to] && (
                                            <div className="sidebar-submenu" style={{ paddingLeft: '28px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                {item.subItems.map(sub => (
                                                    <NavLink
                                                        key={sub.to}
                                                        to={sub.to}
                                                        end
                                                        className={({ isActive }) =>
                                                            `sidebar-item sidebar-subitem ${isActive ? 'active' : ''}`
                                                        }
                                                        style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                                                    >
                                                        {sub.label}
                                                    </NavLink>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <NavLink
                                        to={item.to}
                                        end={item.to === '/'}
                                        className={({ isActive }) =>
                                            `sidebar-item ${isActive ? 'active' : ''}`
                                        }
                                        title={collapsed ? item.label : undefined}
                                    >
                                        <item.icon size={18} />
                                        {!collapsed && item.label}
                                    </NavLink>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="sidebar-user-avatar">{initials}</div>
                    {!collapsed && (
                        <div className="sidebar-user-info">
                            <div className="sidebar-user-name">{displayName}</div>
                            <div className="sidebar-user-role">{user?.rol || 'Operador'}</div>
                        </div>
                    )}
                    <button className="btn-logout" onClick={handleLogout} title="Cerrar sesion">
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    )
}
