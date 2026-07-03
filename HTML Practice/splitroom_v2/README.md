# SplitRoom — Shared Expense Tracker (FastAPI + HTML)

A small web app to track room (common) and personal (partial) expenses for a
changing group of people, with login, per-user permissions, and JSON files
saved on your own machine.

## What's inside
```
splitroom/
├── main.py              # FastAPI backend (auth + data + rules)
├── static/index.html    # the web app (frontend)
└── data/                # JSON files are written here automatically
    ├── db.json          # members, expenses, activity log
    └── users.json       # users + HASHED passwords (created on first run)
```

## 1. Install (one time)
You need Python 3.9+ installed. Then in a terminal:

```bash
cd splitroom
pip install fastapi "uvicorn[standard]"
```

## 2. Set your admin login
Open `main.py` and change these two lines near the top:

```python
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "changeme123"   # <-- pick a strong password
```

(The admin account is created automatically the first time you run the server.)

## 3. Run it
```bash
python -m uvicorn main:app --reload
```
Then open **http://127.0.0.1:8000** in any browser.

## 4. Use from your phone / other laptops (same Wi-Fi)
Run it so other devices on your network can reach it:
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
Find your computer's local IP (e.g. `192.168.1.5`) and on the phone open
`http://192.168.1.5:8000`. Your computer must stay on and running the server.

## Who can do what
| Action                         | Normal user                  | Admin (you) |
|--------------------------------|------------------------------|-------------|
| Sign up / log in               | yes                          | yes         |
| View all expenses & totals     | yes                          | yes         |
| Add an expense                 | yes                          | yes         |
| Edit / delete an expense       | **only ones they created**   | any         |
| Add / edit / delete members    | no                           | yes         |
| Clear activity log             | no (button hidden)           | yes         |

These rules are enforced on the **server**, so they can't be bypassed from the browser.

## Where is my data?
Everything is in plain JSON files in the `data/` folder — back them up by copying
that folder. Passwords are stored only as salted SHA-256 hashes, never in plain text.

## Notes
- Sessions use a simple bearer token (kept in the browser tab). Closing the tab
  logs you out; log back in anytime.
- This is built for a small trusted group on a local network. If you ever expose
  it to the public internet, put it behind HTTPS and consider stronger auth (JWT
  with expiry, rate limiting).
```
