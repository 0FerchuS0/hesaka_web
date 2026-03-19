import urllib.request
import json

url = "http://localhost:8000/api/reportes/ventas/pdf?tenant_slug=demo"
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        print("Status code:", response.status)
        data = response.read()
        print("Response len:", len(data))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    try:
        err_msg = e.read().decode('utf-8')
        print("Error details:", err_msg)
    except:
        pass
except Exception as e:
    print("Request failed:", e)
