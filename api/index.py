"""Entrada de Vercel: el backend FastAPI (backend/main.py) como función serverless.

vercel.json reescribe /api/* a esta función; FastAPI recibe la ruta original
(/api/chat, /api/models/..., etc.). El backend no guarda estado: las claves de
cada proveedor viajan en cada pedido desde el navegador.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from main import app  # noqa: E402,F401
