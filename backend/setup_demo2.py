import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import bcrypt

DB_USER = "postgres"
DB_PASS = "123456"
DB_HOST = "localhost"
DB_PORT = "5432"

try:
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
    
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(b"admin123", salt).decode('utf-8')
    
    cursor.execute("SELECT 1 FROM usuarios WHERE email = 'admin@hesaka.com'")
    if not cursor.fetchone():
        cursor.execute("INSERT INTO usuarios (email, hashed_password, nombre_completo, rol) VALUES (%s, %s, %s, %s)",
                       ('admin@hesaka.com', hashed, 'Admin HESAKA', 'ADMIN'))
        print("Usuario administrador web creado: admin@hesaka.com / admin123")
    else:
        print("Usuario administrador web ya existía.")
    
    conn.commit()
    cursor.close()
    conn.close()

    print("SUCCESS: Configuración completada exitosamente.")
except Exception as e:
    print(f"ERROR: {e}")
