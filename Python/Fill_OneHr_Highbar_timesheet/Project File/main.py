# import pprint
import sys

import pyperclip
import pandas as pd
import json
import os
import time
from playwright.sync_api import sync_playwright

# =========================
# RESOLVE BASE DIRECTORY
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Read raw clipboard text
raw = pyperclip.paste()

# Split into rows, then each row into cells by tab
data = [line.split('\t') for line in raw.strip().split('\n')]

from datetime import datetime

def change_format(input_date):
    if not input_date:   # handles '' or None
        return ''        # or return input_date

    try:
        dt = datetime.strptime(input_date, "%d-%b-%y")
        return dt.strftime("%A, %B %d,")
    except ValueError:
        return input_date   # fallback (no crash)

data = [[change_format(row[0]), *row[1:]] for row in data]

print("Raw data:")
for row in data:
    print(row)

# Forward fill the Date (first column)
last_date = None
for row in data:
    if row[0].strip():        # if date cell is not empty
        last_date = row[0].strip()
    else:
        row[0] = last_date    # fill with last seen date

print("\nAfter ffill:")
for row in data:
    print(row)

# =========================
# LOAD CONFIG
# =========================
config_path = os.path.join(BASE_DIR, "config.json")   #  always resolves correctly

if not os.path.exists(config_path):
    raise FileNotFoundError(
        f" config.json not found at: {config_path}\n"
        "Make sure config.json is in the SAME folder as this script."
    )

with open(config_path) as f:
    config = json.load(f)

print(f"\n Config loaded from: {config_path}")

# sys.exit(0)   # Remove this line to run the Playwright automation after verifying data and config

# =========================
# 3 & 4. PLAYWRIGHT FLOW
# =========================
with sync_playwright() as p:
    browser = p.chromium.launch_persistent_context(
        user_data_dir= f"{BASE_DIR}\\user_data",  # Keep session data for reuse
        channel="msedge",
        headless=False,
        slow_mo=300
    )
    
    page = browser.new_page()

    #  Global dialog handler — prevents Playwright from hanging on any alert/confirm

    try:
        # ------------------------------------------------------------------
        #  LOGIN
        # ------------------------------------------------------------------
        page.goto(config["url"])

        page.get_by_role("textbox", name="Email").fill(config["username"])
        page.get_by_role("textbox", name="Password").fill(config["password"])
        
        #  Abort all image/media/font requests to make page loads faster globally
        page.route(
            "**/*", #Path
            lambda route: route.abort()
            if route.request.resource_type in ["image", "media", "font"] #["image", "media", "font", "stylesheet"] 
            else route.continue_()
        )

        page.get_by_role("button", name="Submit").click()
        print(" Login successful")

        # # ------------------------------------------------------------------
        # #  NAVIGATE TO TIMESHEET
        # # ------------------------------------------------------------------
        page.goto(config["timesheet_url"])
        page.get_by_role("link", name="Record Timesheet").click()
        page.wait_for_load_state("networkidle")
        print(" Opened Record Timesheet page")

        # ------------------------------------------------------------------
        #  LOOP BY DATE
        # ------------------------------------------------------------------
        errors = []     # collect errors instead of breaking immediately

        for date, _, task, remarks, hours in data:   # preserve order
            print(f"\n Processing Date: {date}")

            print(f"Task: {task} | Hours: {hours}")

            try:
                # --- Select Date ---
                page.locator("#MainContent_txtFromdate").click()

                page.get_by_title(date).click()
                page.wait_for_load_state("networkidle")

                # --- Select Project (once per date) ---
                page.get_by_title("Please select project").click()
                page.locator("input[type='search']").fill(config["project_search"])
                page.get_by_role("treeitem", name=config["project_name"]).click()
                page.wait_for_load_state("networkidle")

                # Task dropdown
                page.get_by_title("Please select task").click()
                page.get_by_role("treeitem", name=task).click()

                # Hours
                page.locator("#MainContent_txtHours").fill(hours)

                # Remarks / Description
                page.locator("#MainContent_txtDescription").fill(remarks)

                #  Submit — uncomment when ready

                page.on("dialog", lambda dialog: dialog.accept())
                page.get_by_role("link", name="Submit").click()

                # page.goto("https://ess.highbartech.com/hrms/procs/TimesheetRecord.aspx") # for testing without submit, to reset form for next entry
                page.wait_for_load_state("networkidle")

            except Exception as row_error:
                msg = f"Task: {task} | Error: {row_error}"
                print(f"   {msg}")
                errors.append(msg)
                page.pause()  # Pause on error for debugging — remove or comment out in production
                # Choose ONE:
                # continue   # skip this row and carry on
                break       # stop this date group on first error

        # ------------------------------------------------------------------
        #  DONE
        # ------------------------------------------------------------------
        if errors:
            summary = f"{len(errors)} error(s) occurred. Check console / screenshots."
            print(f"\n  Completed with errors:\n" + "\n".join(errors))
            page.pause()  # Pause on error for debugging — remove or comment out in production
        else:
            print("\n All entries completed successfully!")

    except Exception as e:
        error_msg = str(e)
        print(f"\n FATAL ERROR: {error_msg}")
        page.pause()  # Pause on error for debugging — remove or comment out in production

    finally:
        time.sleep(3)
        browser.close()
        print("Browser closed.")
