"""Vercel entry point for BillPro.

The original Flask application is kept in the legacy nested project folder.
This wrapper loads it and fixes the static/template paths for deployment.
"""
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.join(ROOT, "BillPro_Vercel", "BillPro_Vercel")
APP_FILE = os.path.join(APP_DIR, "api", "Billpro.py")

spec = importlib.util.spec_from_file_location("billpro_app", APP_FILE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load BillPro application: {APP_FILE}")

module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

app = module.app

# Billpro.py was originally written for local execution. Its relative
# static/template paths therefore point inside api/. Correct them for Vercel.
app.static_folder = os.path.join(APP_DIR, "static")
app.template_folder = os.path.join(APP_DIR, "templates")
try:
    from jinja2 import FileSystemLoader
    app.jinja_loader = FileSystemLoader(app.template_folder)
except Exception:
    pass

# Vercel imports this module and uses the Flask `app` WSGI object.
