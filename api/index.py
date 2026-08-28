"""Vercel entry point for BillPro with persistent PostgreSQL storage."""
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.join(ROOT, "BillPro_Vercel", "BillPro_Vercel")
APP_FILE = os.path.join(APP_DIR, "api", "Billpro.py")

# Make repository-root modules (including storage.py) importable.
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location("billpro_app", APP_FILE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load BillPro application: {APP_FILE}")

module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

# ── Persistent production storage ─────────────────────────────────
# The legacy API/data model is preserved, but filesystem persistence is
# replaced by PostgreSQL/Supabase whenever DATABASE_URL is configured.
from storage import enabled as database_enabled, load as database_load, save as database_save


def load_data():
    if not database_enabled():
        raise RuntimeError(
            "DATABASE_URL is not configured. Add your Supabase/PostgreSQL "
            "connection string to Vercel Environment Variables."
        )
    return database_load(module.DEFAULT_DATA, module.hash_pw)


def save_data(data):
    if not database_enabled():
        raise RuntimeError(
            "DATABASE_URL is not configured. Add your Supabase/PostgreSQL "
            "connection string to Vercel Environment Variables."
        )
    database_save(data)

# Route functions in Billpro.py resolve globals from that module.
module.load_data = load_data
module.save_data = save_data

app = module.app

# Correct Flask asset/template locations for the repository-root Vercel deployment.
app.static_folder = os.path.join(APP_DIR, "static")
app.template_folder = os.path.join(APP_DIR, "templates")
try:
    from jinja2 import FileSystemLoader
    app.jinja_loader = FileSystemLoader(app.template_folder)
except Exception:
    pass

# The legacy / route uses its old BASE path. Replace that view with a deployment-safe one.
from flask import send_file

def vercel_index():
    return send_file(os.path.join(APP_DIR, "templates", "index.html"))

app.view_functions["index"] = vercel_index

# Vercel imports this Flask `app` as the WSGI application.
