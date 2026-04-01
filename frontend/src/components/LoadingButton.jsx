export default function LoadingButton({
    loading = false,
    loadingText = 'Procesando...',
    disabled = false,
    className = 'btn btn-primary',
    style,
    children,
    type = 'button',
    ...props
}) {
    return (
        <button
            type={type}
            className={className}
            style={style}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className="btn-loading-spinner" aria-hidden="true" />}
            <span>{loading ? loadingText : children}</span>
        </button>
    )
}
