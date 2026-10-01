import psycopg2

DATABASE_URL = 'postgresql://apicem:Root123@localhost:5432/apicem'
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

TARGET = 'ffc6f29a-fdc6-4eca-b1d2-b57f375be191'
print(f'=== Searching for {TARGET} ===')
cur.execute('SELECT workbook_id, tenant_id, name FROM app.workbooks WHERE workbook_id::text = %s', (TARGET,))
print('In app.workbooks:', cur.fetchall())

cur.execute('SELECT report_id, tenant_id, name FROM app.reports WHERE report_id::text = %s', (TARGET,))
print('In app.reports:', cur.fetchall())

print('\n=== Workbooks in DB ===')
cur.execute('SELECT workbook_id, tenant_id, name FROM app.workbooks')
for r in cur.fetchall():
    print(r)

print('\n=== Reports in DB ===')
cur.execute('SELECT report_id, tenant_id, name FROM app.reports')
for r in cur.fetchall():
    print(r)

print('\n=== Sessions in DB ===')
cur.execute('SELECT session_id, user_id, tenant_id, created_at FROM app.sessions ORDER BY created_at DESC LIMIT 5')
for r in cur.fetchall():
    print(r)
