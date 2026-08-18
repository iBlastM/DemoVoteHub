#!/usr/bin/env python3
"""Servidor de desarrollo local para MIRADOR 2027 (demo).

La app usa módulos ES (`type="module"`) y carga el GeoJSON vía fetch,
lo cual no funciona abriendo el archivo con file://. Este servidor
sirve la carpeta actual en http://localhost:8000.

Uso:
    python serve.py           # puerto 8000
    python serve.py 5500      # puerto indicado
"""

import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    # Sin cache durante el desarrollo.
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # menos ruido en consola
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"MIRADOR 2027 -> http://localhost:{PORT}  (Ctrl+C para detener)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nDetenido.")
