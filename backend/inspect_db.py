import sqlite3
import json

conn = sqlite3.connect('astro_db.sqlite')
cursor = conn.cursor()

print("--- TABLES ---")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
print(cursor.fetchall())

print("\n--- TENANTS ---")
cursor.execute("SELECT * FROM tenants;")
print(cursor.fetchall())

print("\n--- KNOWLEDGE BASE ---")
cursor.execute("SELECT id, tenant_id, url_origen, length(texto_scrapeado_limpio) FROM knowledge_base;")
print(cursor.fetchall())

print("\n--- CHANNELS CREDENTIALS ---")
cursor.execute("SELECT * FROM channels_credentials;")
for row in cursor.fetchall():
    print(row)

print("\n--- CONVERSATIONS THREADS ---")
cursor.execute("SELECT id, tenant_id, canal_origen, contacto_identificador_plataforma, ai_active_status FROM conversations_threads;")
print(cursor.fetchall())

conn.close()
