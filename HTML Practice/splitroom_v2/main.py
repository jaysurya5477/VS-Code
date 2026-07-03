"""
SplitRoom backend — FastAPI
Run:  pip install fastapi uvicorn
      python -m uvicorn main:app --reload
Then open http://127.0.0.1:8000 in your browser.

Data is saved as JSON files on YOUR system in the ./data folder:
  data/db.json     -> members, expenses, activity log
  data/users.json  -> registered users (passwords are hashed, never stored plain)
"""

import json, os, hashlib, secrets, time
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------- config
BASE = Path(__file__).parent
DATA = BASE / "data"
DATA.mkdir(exist_ok=True)
DB_FILE = DATA / "db.json"
USERS_FILE = DATA / "users.json"

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "changeme123")

# ---------------------------------------------------------------- storage helpers
def _read(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default
    return default

def _write(path: Path, obj):
    # atomic-ish write so the file is never half-written
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)

def load_db():
    return _read(DB_FILE, {"members": [], "expenses": [], "log": [], "seq": {"m": 0, "e": 0}})

def save_db(db):
    _write(DB_FILE, db)

def load_users():
    return _read(USERS_FILE, {})  # { username: {pwd_hash, salt, is_admin, token} }

def save_users(u):
    _write(USERS_FILE, u)

# ---------------------------------------------------------------- auth helpers
def hash_pw(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()

def make_token() -> str:
    return secrets.token_urlsafe(24)

def ensure_admin():
    """Make sure the hardcoded admin always exists."""
    users = load_users()
    if ADMIN_USERNAME not in users:
        salt = secrets.token_hex(8)
        users[ADMIN_USERNAME] = {
            "pwd_hash": hash_pw(ADMIN_PASSWORD, salt),
            "salt": salt,
            "is_admin": True,
            "token": None,
        }
        save_users(users)

ensure_admin()

def current_user(authorization: Optional[str] = Header(None)):
    """Resolve the bearer token to a user. Raises 401 if invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    users = load_users()
    for uname, u in users.items():
        if u.get("token") and u["token"] == token:
            return {"username": uname, "is_admin": u.get("is_admin", False)}
    raise HTTPException(401, "Invalid or expired session")

def require_admin(user=Depends(current_user)):
    if not user["is_admin"]:
        raise HTTPException(403, "Admin only")
    return user

# ---------------------------------------------------------------- app
app = FastAPI(title="SplitRoom")

# ---------- models
class Credentials(BaseModel):
    username: str
    password: str

class ExpenseIn(BaseModel):
    id: Optional[str] = None
    title: str
    amount: float
    date: str
    payer: str
    type: str            # 'room' | 'personal'
    split: str           # 'equal' | 'custom'
    parts: list          # [{m, amt}]
    remarks: str = ""

class MemberIn(BaseModel):
    id: Optional[str] = None
    name: str
    active: bool = True

# ---------------------------------------------------------------- auth routes
@app.post("/api/signup")
def signup(c: Credentials):
    uname = c.username.strip()
    if not uname or not c.password:
        raise HTTPException(400, "Username and password required")
    users = load_users()
    if uname in users:
        raise HTTPException(409, "Username already taken")
    salt = secrets.token_hex(8)
    token = make_token()
    users[uname] = {
        "pwd_hash": hash_pw(c.password, salt),
        "salt": salt,
        "is_admin": False,
        "token": token,
    }
    save_users(users)
    return {"username": uname, "is_admin": False, "token": token}

@app.post("/api/login")
def login(c: Credentials):
    users = load_users()
    u = users.get(c.username.strip())
    if not u or hash_pw(c.password, u["salt"]) != u["pwd_hash"]:
        raise HTTPException(401, "Wrong username or password")
    token = make_token()
    u["token"] = token
    save_users(users)
    return {"username": c.username.strip(), "is_admin": u["is_admin"], "token": token}

@app.post("/api/logout")
def logout(user=Depends(current_user)):
    users = load_users()
    users[user["username"]]["token"] = None
    save_users(users)
    return {"ok": True}

@app.get("/api/me")
def me(user=Depends(current_user)):
    return user

@app.get("/api/users")
def list_users(user=Depends(require_admin)):
    """Return registered usernames so admin can pick when adding members."""
    users = load_users()
    return {"users": list(users.keys())}

# ---------------------------------------------------------------- data routes
def log_action(db, action, what, who):
    db["seq"]["e"] = db["seq"].get("e", 0) + 1
    db["log"].insert(0, {
        "id": "e" + str(db["seq"]["e"]),
        "action": action, "what": what, "who": who, "ts": int(time.time() * 1000),
    })
    db["log"] = db["log"][:500]

@app.get("/api/data")
def get_data(user=Depends(current_user)):
    """Everyone logged in can READ everything."""
    return load_db()

# ----- expenses
@app.post("/api/expense")
def upsert_expense(e: ExpenseIn, user=Depends(current_user)):
    db = load_db()
    if e.id:  # editing existing
        idx = next((i for i, x in enumerate(db["expenses"]) if x["id"] == e.id), None)
        if idx is None:
            raise HTTPException(404, "Expense not found")
        owner = db["expenses"][idx].get("createdBy")
        # OWNERSHIP RULE: only the creator or an admin may edit
        if owner != user["username"] and not user["is_admin"]:
            raise HTTPException(403, "You can only edit expenses you created")
        rec = e.dict()
        rec["createdBy"] = owner  # preserve original creator
        db["expenses"][idx] = rec
        log_action(db, "modify", f'Edited expense "{e.title}" (₹{e.amount})', user["username"])
    else:  # new
        db["seq"]["e"] = db["seq"].get("e", 0) + 1
        rec = e.dict()
        rec["id"] = "x" + str(db["seq"]["e"])
        rec["createdBy"] = user["username"]
        db["expenses"].append(rec)
        log_action(db, "insert", f'Added {e.type} expense "{e.title}" (₹{e.amount})', user["username"])
    save_db(db)
    return db

@app.delete("/api/expense/{eid}")
def delete_expense(eid: str, user=Depends(current_user)):
    db = load_db()
    ex = next((x for x in db["expenses"] if x["id"] == eid), None)
    if not ex:
        raise HTTPException(404, "Expense not found")
    if ex.get("createdBy") != user["username"] and not user["is_admin"]:
        raise HTTPException(403, "You can only delete expenses you created")
    db["expenses"] = [x for x in db["expenses"] if x["id"] != eid]
    log_action(db, "delete", f'Deleted expense "{ex["title"]}" (₹{ex["amount"]})', user["username"])
    save_db(db)
    return db

# ----- members (ADMIN ONLY)
@app.post("/api/member")
def upsert_member(m: MemberIn, user=Depends(require_admin)):
    db = load_db()
    palette = ['#ffb347','#5fd3bc','#7aa2ff','#ff9b85','#c39bff','#7ee787','#ff7eb6','#f2cc60','#79c0ff','#ffa657']
    if m.id:
        mem = next((x for x in db["members"] if x["id"] == m.id), None)
        if not mem:
            raise HTTPException(404, "Member not found")
        mem["name"], mem["active"] = m.name, m.active
        log_action(db, "modify", f'Edited member "{m.name}"', user["username"])
    else:
        db["seq"]["m"] = db["seq"].get("m", 0) + 1
        db["members"].append({
            "id": "m" + str(db["seq"]["m"]),
            "name": m.name, "active": True,
            "color": palette[len(db["members"]) % len(palette)],
        })
        log_action(db, "insert", f'Added member "{m.name}"', user["username"])
    save_db(db)
    return db

@app.delete("/api/member/{mid}")
def delete_member(mid: str, user=Depends(require_admin)):
    db = load_db()
    mem = next((x for x in db["members"] if x["id"] == mid), None)
    if not mem:
        raise HTTPException(404, "Member not found")
    used = any(e["payer"] == mid or any(p["m"] == mid for p in e["parts"]) for e in db["expenses"])
    if used:
        mem["active"] = False
        log_action(db, "modify", f'Set member "{mem["name"]}" inactive (has expenses)', user["username"])
    else:
        db["members"] = [x for x in db["members"] if x["id"] != mid]
        log_action(db, "delete", f'Deleted member "{mem["name"]}"', user["username"])
    save_db(db)
    return db

# ----- clear log (ADMIN ONLY)
@app.post("/api/clear-log")
def clear_log(user=Depends(require_admin)):
    db = load_db()
    db["log"] = []
    save_db(db)
    return db

# ---------------------------------------------------------------- serve frontend
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")
