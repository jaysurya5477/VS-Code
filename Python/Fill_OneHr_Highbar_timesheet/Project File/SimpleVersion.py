import time
import json
import os
from datetime import datetime

import pyperclip
from playwright.sync_api import sync_playwright

# =========================
# STEP 1 — LOAD CONFIG
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
config_path = os.path.join(BASE_DIR, "config.json")

if not os.path.exists(config_path):
    raise FileNotFoundError(f"config.json not found at: {config_path}")

with open(config_path) as f:
    config = json.load(f)

print("Config loaded.")

# =========================
# STEP 2 — READ CLIPBOARD
# =========================
raw = pyperclip.paste()
data = [line.split("\t") for line in raw.strip().split("\n")]

# Convert date format: '15-Apr-25' → 'Tuesday, April 15,'
for row in data:
    if row[0].strip():
        try:
            row[0] = datetime.strptime(row[0], "%d-%b-%y").strftime("%A, %B %d,")
        except ValueError:
            pass  # Leave as-is if format doesn't match

# Forward-fill empty date cells (so every row has a date)
last_date = None
for row in data:
    if row[0].strip():
        last_date = row[0].strip()
    else:
        row[0] = last_date

print("\nData to be entered:")
for row in data:
    print(f"  {row}")

# Uncomment the line below to stop here and just check the data before running
# raise SystemExit("Stopped for data check.")

# =========================
# STEP 3 — OPEN BROWSER
# =========================
with sync_playwright() as p:
    browser = p.chromium.launch_persistent_context(
        user_data_dir=os.path.join(BASE_DIR, "user_data"),
        channel="msedge",
        headless=False,
        slow_mo=300,
    )

    page = browser.new_page()

    # Skip loading images/fonts to make pages load faster
    page.route(
        "**/*",
        lambda route: route.abort()
        if route.request.resource_type in ["image", "media", "font"]
        else route.continue_(),
    )

    # =========================
    # STEP 4 — LOGIN
    # =========================
    try:
        page.goto(config["url"])
        page.get_by_role("textbox", name="Email").fill(config["username"])
        page.get_by_role("textbox", name="Password").fill(config["password"])
        page.get_by_role("button", name="Submit").click()
        print("Logged in successfully.")

        # =========================
        # STEP 5 — GO TO TIMESHEET
        # =========================
        page.goto(config["timesheet_url"])
        page.get_by_role("link", name="Record Timesheet").click()
        page.wait_for_load_state("networkidle")
        print("Timesheet page opened.")

        # =========================
        # STEP 6 — FILL EACH ROW
        # =========================
        errors = []

        for date, _, task, remarks, hours in data:
            print(f"\n→ Date: {date} | Task: {task} | Hours: {hours}")

            try:
                # Pick the date on the calendar
                page.locator("#MainContent_txtFromdate").click()
                page.get_by_title(date).click()
                page.wait_for_load_state("networkidle")

                # Pick the project
                page.get_by_title("Please select project").click()
                page.locator("input[type='search']").fill(config["project_search"])
                page.get_by_role("treeitem", name=config["project_name"]).click()
                page.wait_for_load_state("networkidle")

                # Pick the task
                page.get_by_title("Please select task").click()
                page.get_by_role("treeitem", name=task).click()

                # Fill hours and remarks
                page.locator("#MainContent_txtHours").fill(hours)
                page.locator("#MainContent_txtDescription").fill(remarks)

                # --- SUBMIT (uncomment when ready) ---
                # page.on("dialog", lambda dialog: dialog.accept())
                # page.get_by_role("link", name="Submit").click()

                # Reset form for next entry (remove this line when submitting for real)
                page.goto(config["timesheet_url"])
                page.wait_for_load_state("networkidle")

            except Exception as row_error:
                print(f"  ERROR on task '{task}': {row_error}")
                errors.append(f"Date: {date} | Task: {task} | Error: {row_error}")
                page.pause()  # Pauses browser so you can see what went wrong
                break  # Change to `continue` if you want to skip and move to the next row

        # =========================
        # STEP 7 — SHOW RESULTS
        # =========================
        if errors:
            print(f"\nDone with {len(errors)} error(s):")
            for err in errors:
                print(f"  - {err}")
            page.pause()
        else:
            print("\nAll entries submitted successfully!")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        page.pause()

    finally:
        time.sleep(3)
        browser.close()
        print("Browser closed.")
