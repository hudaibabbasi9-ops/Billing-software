#!/usr/bin/env python3
"""
BillPro — Local Billing Software
Run:   python billpro.py
Open:  http://localhost:5000
Login: admin / admin123
Data is saved in data/billpro.json  (survives every restart)
"""

import os, sys, json, hashlib, datetime, socket, threading, webbrowser
from functools import wraps
from io import BytesIO

# ── Auto-install dependencies ─────────────────────────────────────
def pip(pkg):
    os.system(f"{sys.executable} -m pip install {pkg} -q")

try:
    from flask import Flask, request, jsonify, session, send_file
except ImportError:
    print("Installing flask…"); pip("flask flask-cors"); from flask import Flask, request, jsonify, session, send_file

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER
except ImportError:
    print("Installing reportlab…"); pip("reportlab"); 
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER

# ── Paths ─────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE, "data", "billpro.json")
os.makedirs(os.path.join(BASE, "data"), exist_ok=True)

# ── Flask app ─────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = "billpro-2024-xK9mP3qR"

# ── JSON Data Store ───────────────────────────────────────────────
DEFAULT_DATA = {
    "users": [
        {"id": 1, "username": "admin", "password": "", "name": "Administrator", "role": "admin"}
    ],
    "customers": [],
    "items": [
        {"id": 1, "name": "Consulting (per hour)", "price": 150.0, "description": ""},
        {"id": 2, "name": "Web Design",            "price": 500.0, "description": ""},
        {"id": 3, "name": "Monthly Support",        "price": 200.0, "description": ""},
    ],
    "invoices": [],
    "settings": {
        "company": "My Business",
        "tax_rate": 10.0,
        "currency": "$",
        "invoice_prefix": "INV-",
        "invoice_counter": 1001,
        "company_address": "",
        "company_phone": "",
        "company_email": ""
    },
    "_next_user_id":     2,
    "_next_customer_id": 1,
    "_next_item_id":     4,
    "_next_invoice_id":  1
}

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                d = json.load(f)
            # Merge in any missing keys from DEFAULT_DATA
            for k, v in DEFAULT_DATA.items():
                if k not in d:
                    d[k] = v
            return d
        except Exception:
            pass
    # First run — create with hashed admin password
    d = json.loads(json.dumps(DEFAULT_DATA))
    d["users"][0]["password"] = hash_pw("admin123")
    save_data(d)
    return d

def save_data(d):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

# ── Auth helpers ──────────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def dec(*a, **kw):
        if "user" not in session:
            return jsonify({"error": "Not authenticated"}), 401
        return f(*a, **kw)
    return dec

def admin_required(f):
    @wraps(f)
    def dec(*a, **kw):
        if "user" not in session or session["user"]["role"] != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*a, **kw)
    return dec

# ── Auth routes ───────────────────────────────────────────────────
@app.route("/api/login", methods=["POST"])
def api_login():
    body = request.get_json() or {}
    d = load_data()
    user = next((u for u in d["users"] if u["username"] == body.get("username", "")), None)
    if not user or user["password"] != hash_pw(body.get("password", "")):
        return jsonify({"error": "Invalid credentials"}), 401
    session["user"] = {"id": user["id"], "username": user["username"],
                       "name": user["name"], "role": user["role"]}
    return jsonify({"user": session["user"]})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me")
def api_me():
    if "user" not in session:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify({"user": session["user"]})

# ── Settings ──────────────────────────────────────────────────────
@app.route("/api/settings", methods=["GET"])
@login_required
def api_settings_get():
    d = load_data()
    return jsonify(d["settings"])

@app.route("/api/settings", methods=["POST"])
@admin_required
def api_settings_post():
    d = load_data()
    body = request.get_json() or {}
    allowed = ["company","tax_rate","currency","invoice_prefix",
               "company_address","company_phone","company_email"]
    for k in allowed:
        if k in body:
            val = body[k]
            if k == "tax_rate":
                val = float(val)
            d["settings"][k] = val
    save_data(d)
    return jsonify({"ok": True})

# ── Users ─────────────────────────────────────────────────────────
@app.route("/api/users", methods=["GET"])
@admin_required
def api_users_get():
    d = load_data()
    return jsonify([{k: v for k, v in u.items() if k != "password"} for u in d["users"]])

@app.route("/api/users", methods=["POST"])
@admin_required
def api_users_post():
    d = load_data()
    body = request.get_json() or {}
    if not body.get("username") or not body.get("password"):
        return jsonify({"error": "Username and password required"}), 400
    if any(u["username"] == body["username"] for u in d["users"]):
        return jsonify({"error": "Username already taken"}), 400
    uid = d["_next_user_id"]; d["_next_user_id"] += 1
    d["users"].append({"id": uid, "username": body["username"],
                       "password": hash_pw(body["password"]),
                       "name": body.get("name", body["username"]),
                       "role": body.get("role", "user")})
    save_data(d)
    return jsonify({"ok": True})

@app.route("/api/users/<int:uid>", methods=["DELETE"])
@admin_required
def api_users_delete(uid):
    if session["user"]["id"] == uid:
        return jsonify({"error": "Cannot delete yourself"}), 400
    d = load_data()
    d["users"] = [u for u in d["users"] if u["id"] != uid]
    save_data(d)
    return jsonify({"ok": True})

# ── Items ─────────────────────────────────────────────────────────
@app.route("/api/items", methods=["GET"])
@login_required
def api_items_get():
    d = load_data()
    return jsonify(sorted(d["items"], key=lambda x: x["name"]))

@app.route("/api/items", methods=["POST"])
@admin_required
def api_items_post():
    d = load_data()
    body = request.get_json() or {}
    if not body.get("name"):
        return jsonify({"error": "Name required"}), 400
    iid = d["_next_item_id"]; d["_next_item_id"] += 1
    item = {"id": iid, "name": body["name"],
            "price": float(body.get("price", 0)),
            "description": body.get("description", "")}
    d["items"].append(item)
    save_data(d)
    return jsonify(item)

@app.route("/api/items/<int:iid>", methods=["DELETE"])
@admin_required
def api_items_delete(iid):
    d = load_data()
    d["items"] = [i for i in d["items"] if i["id"] != iid]
    save_data(d)
    return jsonify({"ok": True})

# ── Customers ─────────────────────────────────────────────────────
@app.route("/api/customers", methods=["GET"])
@login_required
def api_customers_get():
    d = load_data()
    return jsonify(sorted(d["customers"], key=lambda x: x["name"]))

@app.route("/api/customers", methods=["POST"])
@login_required
def api_customers_post():
    d = load_data()
    body = request.get_json() or {}
    if not body.get("name"):
        return jsonify({"error": "Name required"}), 400
    cid = d["_next_customer_id"]; d["_next_customer_id"] += 1
    cust = {"id": cid, "name": body["name"],
            "email": body.get("email", ""),
            "phone": body.get("phone", ""),
            "address": body.get("address", ""),
            "created_at": datetime.datetime.now().isoformat()}
    d["customers"].append(cust)
    save_data(d)
    return jsonify(cust)

@app.route("/api/customers/<int:cid>", methods=["PUT"])
@admin_required
def api_customers_put(cid):
    d = load_data()
    body = request.get_json() or {}
    cust = next((c for c in d["customers"] if c["id"] == cid), None)
    if not cust:
        return jsonify({"error": "Not found"}), 404
    for k in ["name", "email", "phone", "address"]:
        if k in body:
            cust[k] = body[k]
    save_data(d)
    return jsonify(cust)

@app.route("/api/customers/<int:cid>", methods=["DELETE"])
@admin_required
def api_customers_delete(cid):
    d = load_data()
    d["customers"] = [c for c in d["customers"] if c["id"] != cid]
    save_data(d)
    return jsonify({"ok": True})

@app.route("/api/customers/<int:cid>/invoices")
@login_required
def api_customer_invoices(cid):
    d = load_data()
    cust = next((c for c in d["customers"] if c["id"] == cid), None)
    if not cust:
        return jsonify({"error": "Not found"}), 404
    invs = [i for i in d["invoices"] if i.get("customer_id") == cid or i.get("customer_name") == cust["name"]]
    invs_sorted = sorted(invs, key=lambda x: x["id"], reverse=True)
    return jsonify({"customer": cust, "invoices": invs_sorted})

# ── Invoices ──────────────────────────────────────────────────────
@app.route("/api/invoices", methods=["GET"])
@login_required
def api_invoices_get():
    d = load_data()
    return jsonify(sorted(d["invoices"], key=lambda x: x["id"], reverse=True))

@app.route("/api/invoices", methods=["POST"])
@login_required
def api_invoices_post():
    d = load_data()
    body = request.get_json() or {}
    if not body.get("customer_name"):
        return jsonify({"error": "Customer name required"}), 400

    # Increment counter
    counter = d["settings"]["invoice_counter"]
    prefix  = d["settings"]["invoice_prefix"]
    inv_num = f"{prefix}{counter}"
    d["settings"]["invoice_counter"] = counter + 1

    inv_id = d["_next_invoice_id"]; d["_next_invoice_id"] += 1
    now = datetime.datetime.now().isoformat()

    inv = {
        "id":             inv_id,
        "invoice_number": inv_num,
        "customer_name":  body["customer_name"],
        "customer_phone": body.get("customer_phone", ""),
        "customer_id":    body.get("customer_id", None),
        "date":           body.get("date", datetime.date.today().isoformat()),
        "due_date":       body.get("due_date", ""),
        "items":          body.get("items", []),
        "subtotal":       float(body.get("subtotal", 0)),
        "tax":            float(body.get("tax", 0)),
        "discount":       float(body.get("discount", 0)),
        "total":          float(body.get("total", 0)),
        "notes":          body.get("notes", ""),
        "status":         body.get("status", "unpaid"),
        "created_by":     session["user"]["name"],
        "edited_by":      "",
        "created_at":     now,
        "updated_at":     now
    }
    d["invoices"].append(inv)

    # Auto-add customer if new
    cname = body["customer_name"].strip()
    if not any(c["name"] == cname for c in d["customers"]):
        cid = d["_next_customer_id"]; d["_next_customer_id"] += 1
        d["customers"].append({
            "id": cid, "name": cname,
            "email": "", "phone": body.get("customer_phone", ""),
            "address": "", "created_at": now
        })

    save_data(d)
    return jsonify(inv)

@app.route("/api/invoices/<int:inv_id>", methods=["PUT"])
@admin_required
def api_invoices_put(inv_id):
    d = load_data()
    body = request.get_json() or {}
    inv = next((i for i in d["invoices"] if i["id"] == inv_id), None)
    if not inv:
        return jsonify({"error": "Not found"}), 404
    for k in ["customer_name","customer_phone","date","due_date",
              "subtotal","tax","discount","total","notes","status","items"]:
        if k in body:
            inv[k] = body[k]
    inv["edited_by"]  = session["user"]["name"]
    inv["updated_at"] = datetime.datetime.now().isoformat()
    save_data(d)
    return jsonify(inv)

@app.route("/api/invoices/<int:inv_id>/status", methods=["PATCH"])
@login_required
def api_invoices_status(inv_id):
    d = load_data()
    body = request.get_json() or {}
    inv = next((i for i in d["invoices"] if i["id"] == inv_id), None)
    if not inv:
        return jsonify({"error": "Not found"}), 404
    inv["status"] = body.get("status", inv["status"])
    inv["updated_at"] = datetime.datetime.now().isoformat()
    save_data(d)
    return jsonify({"ok": True})

@app.route("/api/invoices/<int:inv_id>", methods=["DELETE"])
@admin_required
def api_invoices_delete(inv_id):
    d = load_data()
    d["invoices"] = [i for i in d["invoices"] if i["id"] != inv_id]
    save_data(d)
    return jsonify({"ok": True})

# ── Stats ─────────────────────────────────────────────────────────
@app.route("/api/stats")
@login_required
def api_stats():
    d = load_data()
    paid   = sum(float(i["total"]) for i in d["invoices"] if i["status"] == "paid")
    unpaid = sum(float(i["total"]) for i in d["invoices"] if i["status"] != "paid")
    return jsonify({"paid": paid, "unpaid": unpaid,
                    "count": len(d["invoices"]),
                    "customers": len(d["customers"])})

# ── PDF ───────────────────────────────────────────────────────────
@app.route("/api/invoices/<int:inv_id>/pdf")
@login_required
def api_invoice_pdf(inv_id):
    d = load_data()
    inv = next((i for i in d["invoices"] if i["id"] == inv_id), None)
    if not inv:
        return jsonify({"error": "Not found"}), 404
    cfg = d["settings"]
    cur_sym  = cfg.get("currency", "$")
    tax_rate = cfg.get("tax_rate", 10)
    company  = cfg.get("company", "My Business")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    story  = []

    C_BLUE   = colors.HexColor("#185fa5")
    C_DARK   = colors.HexColor("#1a1a19")
    C_GRAY   = colors.HexColor("#6b6b67")
    C_LGRAY  = colors.HexColor("#f5f5f4")
    C_BORDER = colors.HexColor("#e0e0df")

    def sty(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    H1   = sty("H1",   fontName="Helvetica-Bold", fontSize=22, textColor=C_DARK)
    BODY = sty("BODY", fontName="Helvetica",       fontSize=9,  textColor=C_GRAY)
    BOLD = sty("BOLD", fontName="Helvetica-Bold",  fontSize=9,  textColor=C_DARK)
    TH   = sty("TH",   fontName="Helvetica-Bold",  fontSize=8,  textColor=C_GRAY)
    RINV = sty("RINV", fontName="Helvetica-Bold",  fontSize=26, textColor=C_BLUE, alignment=TA_RIGHT)
    RMETA= sty("RMETA",fontName="Helvetica",       fontSize=9,  textColor=C_DARK, alignment=TA_RIGHT)
    FOOT = sty("FOOT", fontName="Helvetica",       fontSize=7,  textColor=C_GRAY, alignment=TA_CENTER)

    status_colors = {
        "paid":    (colors.HexColor("#3b6d11"), colors.HexColor("#eaf3de")),
        "unpaid":  (colors.HexColor("#854f0b"), colors.HexColor("#faeeda")),
        "overdue": (colors.HexColor("#a32d2d"), colors.HexColor("#fcebeb")),
    }
    sc, sb = status_colors.get(inv.get("status","unpaid"), status_colors["unpaid"])

    # Header
    hdr = [[
        [Paragraph(company, H1),
         Paragraph(cfg.get("company_address",""), BODY) if cfg.get("company_address") else Spacer(1,1),
         Paragraph(cfg.get("company_phone",""),   BODY) if cfg.get("company_phone")   else Spacer(1,1),
         Paragraph(cfg.get("company_email",""),   BODY) if cfg.get("company_email")   else Spacer(1,1)],
        [Paragraph("INVOICE", RINV),
         Paragraph(f"<b>#{inv['invoice_number']}</b>", RMETA),
         Paragraph(f"Date: {inv['date']}", RMETA),
         Paragraph(f"Due:  {inv['due_date']}", RMETA)]
    ]]
    ht = Table(hdr, colWidths=[95*mm, 85*mm])
    ht.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                             ("ALIGN", (1,0),(1,-1),"RIGHT"),
                             ("PADDING",(0,0),(-1,-1),0)]))
    story.append(ht); story.append(Spacer(1,4*mm))

    # Status badge
    st_d = [[Paragraph(f"  {inv['status'].upper()}  ",
                        sty("ST", fontName="Helvetica-Bold", fontSize=9,
                            textColor=sc, alignment=TA_RIGHT))]]
    st = Table(st_d, colWidths=[180*mm])
    st.setStyle(TableStyle([("BACKGROUND",(0,0),(0,0),sb),
                             ("ALIGN",(0,0),(0,0),"RIGHT"),
                             ("BOTTOMPADDING",(0,0),(-1,-1),3),
                             ("TOPPADDING",(0,0),(-1,-1),3)]))
    story.append(st)
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=4*mm))

    # Bill To
    story.append(Paragraph("BILL TO", TH)); story.append(Spacer(1,1*mm))
    story.append(Paragraph(inv["customer_name"], BOLD))
    if inv.get("customer_phone"):
        story.append(Paragraph(f"Phone: {inv['customer_phone']}", BODY))
    story.append(Spacer(1,5*mm))

    # Line items
    th_s = sty("TH2", fontName="Helvetica-Bold", fontSize=8, textColor=C_GRAY)
    td_s = sty("TD2", fontName="Helvetica",       fontSize=9, textColor=C_DARK)
    td_r = sty("TDR", fontName="Helvetica",       fontSize=9, textColor=C_DARK, alignment=TA_RIGHT)
    th_r = sty("THR", fontName="Helvetica-Bold",  fontSize=8, textColor=C_GRAY, alignment=TA_RIGHT)

    rows = [[Paragraph("Description",th_s),Paragraph("Qty",th_r),
             Paragraph("Rate",th_r),Paragraph("Amount",th_r)]]
    for it in inv.get("items",[]):
        rows.append([
            Paragraph(str(it.get("desc") or it.get("description","")), td_s),
            Paragraph(str(it.get("qty","")), td_r),
            Paragraph(f"{cur_sym}{float(it.get('rate',0)):.2f}", td_r),
            Paragraph(f"{cur_sym}{float(it.get('amount',0)):.2f}", td_r),
        ])
    if len(rows) == 1:
        rows.append([Paragraph("—",td_s),Paragraph("",td_r),Paragraph("",td_r),Paragraph("",td_r)])

    it_t = Table(rows, colWidths=[105*mm,20*mm,27*mm,28*mm], repeatRows=1)
    ts = [("BACKGROUND",(0,0),(-1,0),C_LGRAY),
          ("LINEBELOW",(0,0),(-1,0),0.5,C_BORDER),
          ("LINEBELOW",(0,-1),(-1,-1),0.5,C_BORDER),
          ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
          ("TOPPADDING",(0,0),(-1,-1),4),
          ("BOTTOMPADDING",(0,0),(-1,-1),4)]
    for i in range(2, len(rows), 2):
        ts.append(("BACKGROUND",(0,i),(-1,i),C_LGRAY))
    it_t.setStyle(TableStyle(ts))
    story.append(it_t); story.append(Spacer(1,5*mm))

    # Totals
    def tot_row(label, val, bold=False, color=C_DARK):
        ls = sty("TS",  fontName="Helvetica-Bold" if bold else "Helvetica",
                 fontSize=11 if bold else 9, textColor=color)
        rs = sty("TSR", fontName="Helvetica-Bold" if bold else "Helvetica",
                 fontSize=11 if bold else 9, textColor=color, alignment=TA_RIGHT)
        return [Paragraph(label,ls), Paragraph(val,rs)]

    tot = [tot_row("Subtotal", f"{cur_sym}{float(inv.get('subtotal',0)):.2f}"),
           tot_row(f"Tax ({tax_rate}%)", f"{cur_sym}{float(inv.get('tax',0)):.2f}")]
    if float(inv.get("discount",0)) > 0:
        tot.append(tot_row("Discount", f"-{cur_sym}{float(inv['discount']):.2f}"))
    tot.append(tot_row("TOTAL", f"{cur_sym}{float(inv.get('total',0)):.2f}", bold=True, color=C_BLUE))

    inner = Table(tot, colWidths=[38*mm,32*mm])
    inner.setStyle(TableStyle([
        ("LINEABOVE",(0,len(tot)-1),(-1,len(tot)-1),0.5,C_BLUE),
        ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3)]))
    tot_t = Table([["", inner]], colWidths=[110*mm,70*mm])
    tot_t.setStyle(TableStyle([("ALIGN",(1,0),(1,0),"RIGHT"),
                                ("VALIGN",(0,0),(-1,-1),"TOP"),
                                ("PADDING",(0,0),(-1,-1),0)]))
    story.append(tot_t)

    if inv.get("notes"):
        story.append(Spacer(1,6*mm))
        story.append(HRFlowable(width="100%",thickness=0.5,color=C_BORDER))
        story.append(Spacer(1,3*mm))
        story.append(Paragraph("NOTES",TH)); story.append(Spacer(1,1*mm))
        story.append(Paragraph(inv["notes"],BODY))

    story.append(Spacer(1,8*mm))
    story.append(HRFlowable(width="100%",thickness=0.5,color=C_BORDER))
    story.append(Spacer(1,2*mm))
    story.append(Paragraph(
        f"Generated by BillPro &bull; {datetime.date.today().strftime('%B %d, %Y')}", FOOT))

    doc.build(story)
    buf.seek(0)
    return send_file(buf, mimetype="application/pdf", as_attachment=True,
                     download_name=f"{inv['invoice_number']}.pdf")

# ── Serve HTML ────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_file(os.path.join(BASE, "templates", "index.html"))

# ── Local IP helper ───────────────────────────────────────────────
def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]; s.close(); return ip
    except Exception:
        return "127.0.0.1"

# ── Entry ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    d = load_data()  # ensure data file exists
    ip   = get_ip()
    port = 5000
    print("=" * 50)
    print("  BillPro — Billing Software")
    print("=" * 50)
    print(f"\n  ✅  Server RUNNING")
    print(f"  🖥️   This computer : http://localhost:{port}")
    print(f"  📱   Other devices  : http://{ip}:{port}")
    print(f"\n  🔑   Login: admin / admin123")
    print(f"  💾   Data : {DATA_FILE}")
    print(f"\n  Press Ctrl+C to stop.\n")
    print("=" * 50)
    def _open():
        import time; time.sleep(1.2); webbrowser.open(f"http://localhost:{port}")
    threading.Thread(target=_open, daemon=True).start()
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)