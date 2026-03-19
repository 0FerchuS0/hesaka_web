import { Component } from 'react'

export default class RouteErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, message: '' }
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            message: error?.message || 'Error desconocido al renderizar el modulo.',
        }
    }

    componentDidCatch(error, info) {
        console.error('RouteErrorBoundary:', error, info)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="page-body">
                    <div className="card">
                        <div className="empty-state" style={{ padding: '56px 20px' }}>
                            <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 10 }}>
                                Ocurrio un error al cargar esta pantalla
                            </h3>
                            <p style={{ color: '#f87171', marginBottom: 10 }}>{this.state.message}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Recarga la pagina. Si persiste, comparte este mensaje para corregirlo.
                            </p>
                        </div>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}
