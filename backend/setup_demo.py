import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DB_USER = "postgres"
DB_PASS = "123456"
DB_HOST = "localhost"
DB_PORT = "5432"

try:
    # 1. Connect to default postgres DB to manage other DBs
    conn = psycopg2.connect(dbname="postgres", user=DB_USER, password=DB_PASS, host=DB_HOST, port=DB_PORT)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()
    
    # Create ADMIN DB
    cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'hesaka_admin'")
    if not cursor.fetchone():
        cursor.execute("CREATE DATABASE hesaka_admin")
        print("Creada BD: hesaka_admin")
        
    # Copy sistema_optica to hesaka_demo
    cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'hesaka_demo'")
    if not cursor.fetchone():
        print("Haciendo copia de sistema_optica hacia hesaka_demo...")
        # Desconectar usuarios de la BD de origen para permitir la copia (template)
        cursor.execute("""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = 'sistema_optica' AND pid <> pg_backend_pid();
        """)
        cursor.execute("CREATE DATABASE hesaka_demo WITH TEMPLATE sistema_optica")
        print("Copia completada: hesaka_demo")
    
    cursor.close()
    conn.close()

    # 2. Insert TENANT into ADMIN DB
    conn = psycopg2.connect(dbname="hesaka_admin", user=DB_USER, password=DB_PASS, host=DB_HOST, port=DB_PORT)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tenants (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(50) UNIQUE NOT NULL,
            db_name VARCHAR(100) NOT NULL,
            plan VARCHAR(50) DEFAULT 'basico',
            modulos JSON,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute("INSERT INTO tenants (slug, db_name, plan) VALUES ('demo', 'hesaka_demo', 'premium') ON CONFLICT (slug) DO NOTHING")
    conn.commit()
    cursor.close()
    conn.close()
    print("Tenant 'demo' registrado en hesaka_admin")

    # 3. Create Web Admin User in hesaka_demo
    conn = psycopg2.connect(dbname="hesaka_demo", user=DB_USER, password=DB_PASS, host=DB_HOST, port=DB_PORT)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            email VARCHAR(100) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            nombre_completo VARCHAR(100) NOT NULL,
            rol VARCHAR(20) DEFAULT 'USUARIO',
            activo BOOLEAN DEFAULT true,
            clinica_asignada_id INTEGER
        )
    ''')
    hashed = pwd_context.hash("admin123")
    cursor.execute("SELECT 1 FROM usuarios WHERE email = 'admin@hesaka.com'")
    if not cursor.fetchone():
        cursor.execute("INSERT INTO usuarios (email, hashed_password, nombre_completo, rol) VALUES (%s, %s, %s, %s)",
                       ('admin@hesaka.com', hashed, 'Admin HESAKA', 'ADMIN'))
        print("Usuario administrador web creado.")
    
    conn.commit()
    cursor.close()
    conn.close()

    print("SUCCESS: Configuración completada exitosamente.")
except Exception as e:
    print(f"ERROR: {e}")
