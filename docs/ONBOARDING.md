# Centro Óptico Santa Fe – Guía de Onboarding

## Panorama general
El proyecto es una aplicación web construida con Vite, React y TypeScript. Usa Tailwind CSS y componentes de shadcn/ui para la interfaz, junto con iconos de lucide-react. La autenticación, almacenamiento de datos y funciones de backend se gestionan a través de Supabase, mientras que React Query está disponible para manejar solicitudes asíncronas y caché de datos.

## Estructura de carpetas clave
- `src/main.tsx`: punto de entrada que monta `<App />` y aplica los estilos globales.
- `src/App.tsx`: define el enrutamiento principal y los proveedores globales (React Query, autenticación, tooltips y notificaciones).
- `src/contexts/`: proveedores de contexto, como la autenticación Supabase (`AuthContext.tsx`).
- `src/pages/`: vistas de alto nivel usadas por el enrutador (Dashboard, Pacientes, Consultas, Citas, Reportes, Respaldo, Ajustes, etc.).
- `src/components/`: componentes compartidos, incluyendo el layout principal, módulos de pacientes/consultas y componentes UI derivados de shadcn.
- `src/hooks/`: hooks personalizados para interactuar con Supabase (por ejemplo, `usePatients`).
- `src/integrations/supabase/`: cliente configurado y tipado generado automáticamente con los esquemas de la base de datos.
- `supabase/migrations/`: definiciones SQL de tablas y políticas para mantener sincronizado el backend.
- Archivos raíz como `package.json`, `tailwind.config.ts` y `vite.config.ts` definen dependencias, temas y compilación.

## Flujo de datos y estado
- La autenticación se proporciona mediante `AuthProvider`, que escucha cambios de sesión de Supabase, expone el usuario actual y helpers (`signIn`, `signUp`, `signOut`) y muestra toasts informativos.
- Las rutas protegidas se envuelven con `ProtectedRoute` en `App.tsx`, que redirige a `/` si no hay sesión activa.
- Hooks como `usePatients` encapsulan la comunicación con Supabase para lectura/escritura, gestionan estados de carga y muestran toasts ante errores o éxitos. Actualizan el estado local para mantener la UI sincronizada sin necesidad de refetch inmediato.
- El componente `Layout` crea la estructura general de la aplicación (encabezado, barra lateral y buscador global de pacientes) y orquesta navegación y cierre de sesión.

## UI y experiencia de usuario
- Los estilos combinan utilidades de Tailwind con clases personalizadas (`medical-card`, `medical-header`, etc.).
- Las bibliotecas de shadcn/ui aportan componentes accesibles (botones, tarjetas, inputs, tooltips, toasts), personalizables por Tailwind.
- Iconografía consistente mediante `lucide-react` refuerza el contexto clínico (usuarios, calendario, reportes, etc.).

## Integración con Supabase
- `src/integrations/supabase/client.ts` instancia el cliente con la URL y key públicas, activando persistencia de sesión en `localStorage`.
- `types.ts` expone los tipos fuertemente tipados de las tablas (pacientes, consultas, citas, doctores, etc.), lo que facilita autocompletado y seguridad de tipos al interactuar con la base.
- Las migraciones SQL en `supabase/migrations` describen la estructura de la base (campos de pacientes, consultas, almacenamiento de archivos adjuntos, políticas de seguridad row-level). Ejecuta estas migraciones al levantar un proyecto Supabase local para replicar el entorno.

## Scripts y herramientas
- `npm run dev`: inicia el servidor de desarrollo en Vite.
- `npm run build`: genera artefactos listos para producción.
- `npm run lint`: ejecuta ESLint con las reglas configuradas.
- `npm run preview`: sirve la build resultante para validación manual.

## Recomendaciones para los primeros pasos
1. **Revisar la autenticación y seguridad**: entiende `AuthContext` y las políticas en las migraciones para garantizar que las operaciones con pacientes y consultas respeten permisos.
2. **Aprender el patrón de hooks + Supabase**: estudia `usePatients` y replica el enfoque para consultas, doctores y citas, aprovechando los tipos generados.
3. **Conocer los componentes UI compartidos**: explora `src/components` (en especial `Layout` y los componentes derivados de shadcn) para mantener consistencia visual.
4. **Profundizar en React Router**: observa las rutas protegidas en `App.tsx` y cómo las páginas se enlazan entre sí.
5. **Configurar Supabase local**: utiliza las migraciones para tener un entorno de prueba y practicar integraciones sin afectar producción.
6. **Adoptar buenas prácticas de estilo**: revisa `index.css` y las clases utilitarias personalizadas para seguir el diseño existente.

Con esta base, el siguiente paso natural es implementar nuevas funcionalidades (por ejemplo, reportes adicionales o automatización de recordatorios) reutilizando el patrón de hooks y componentes establecido.
