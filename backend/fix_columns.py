import psycopg2

try:
    conn = psycopg2.connect(dbname='hesaka_demo', user='postgres', password='123456')
    cur = conn.cursor()
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMP")
    # Forzar el valor por defecto si no lo tomó bien
    cur.execute("ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'USUARIO'")
    conn.commit()
    print("Columnas faltantes creadas con éxito")
except Exception as e:
    print("Error SQL:", e)
finally:
    if 'conn' in locals():
        conn.close()
