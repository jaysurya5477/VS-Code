import sys
import time
import json
import os
from datetime import datetime

import pyperclip
from playwright.sync_api import sync_playwright, BrowserContext, Page

# =========================
# CONSTANTS
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
USER_DATA_DIR = os.path.join(BASE_DIR, "user_data")


# =========================
# DATA HELPERS
# =========================
def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(
            f"config.json not found at: {CONFIG_PATH}\n"
            "Make sure config.json is in the SAME folder as this script."
        )
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    print(f"Config loaded from: {CONFIG_PATH}")
    return config


def parse_date(input_date: str) -> str:
    """Convert '15-Apr-25' → 'Tuesday, April 15,' format."""
    if not input_date:
        return ""
    try:
        return datetime.strptime(input_date, "%d-%b-%y").strftime("%A, %B %d,")
    except ValueError:
        return input_date  # Return as-is if format doesn't match


def load_clipboard_data() -> list[list[str]]:
    """Read tab-separated data from clipboard, parse dates, and forward-fill empty date cells."""
    raw = pyperclip.paste()
    data = [line.split("\t") for line in raw.strip().split("\n")]

    # Parse dates in first column
    data = [[parse_date(row[0]), *row[1:]] for row in data]

    # Forward-fill empty date cells
    last_date = None
    for row in data:
        if row[0].strip():
            last_date = row[0].strip()
        else:
            row[0] = last_date

    return data


def print_data(data: list[list[str]], label: str = "Data") -> None:
    print(f"\n{label}:")
    for row in data:
        print(f"  {row}")


# =========================
# BROWSER HELPERS
# =========================
def launch_browser(playwright) -> BrowserContext:
    return playwright.chromium.launch_persistent_context(
        user_data_dir=USER_DATA_DIR,
        channel="msedge",
        headless=False,
        slow_mo=300,
    )


def block_media(page: Page) -> None:
    """Abort image/media/font requests to speed up page loads."""
    page.route(
        "**/*",
        lambda route: route.abort()
        if route.request.resource_type in ["image", "media", "font"]
        else route.continue_(),
    )


def login(page: Page, config: dict) -> None:
    page.goto(config["url"])
    page.get_by_role("textbox", name="Email").fill(config["username"])
    page.get_by_role("textbox", name="Password").fill(config["password"])
    page.get_by_role("button", name="Submit").click()
    print("Login successful")


def open_timesheet(page: Page, config: dict) -> None:
    page.goto(config["timesheet_url"])
    page.get_by_role("link", name="Record Timesheet").click()
    page.wait_for_load_state("networkidle")
    print("Opened Record Timesheet page")


# =========================
# TIMESHEET ENTRY
# =========================
def fill_entry(page: Page, config: dict, date: str, task: str, remarks: str, hours: str) -> None:
    """Fill in a single timesheet row."""
    # Select date
    page.locator("#MainContent_txtFromdate").click()
    page.get_by_title(date).click()
    page.wait_for_load_state("networkidle")

    # Select project
    page.get_by_title("Please select project").click()
    page.locator("input[type='search']").fill(config["project_search"])
    page.get_by_role("treeitem", name=config["project_name"]).click()
    page.wait_for_load_state("networkidle")

    # Select task
    page.get_by_title("Please select task").click()
    page.get_by_role("treeitem", name=task).click()

    # Fill hours and remarks
    page.locator("#MainContent_txtHours").fill(hours)
    page.locator("#MainContent_txtDescription").fill(remarks)

    # Submit — uncomment when ready
    # page.on("dialog", lambda dialog: dialog.accept())
    # page.get_by_role("link", name="Submit").click()

    # Reset form for next entry (remove when submitting for real)
    page.goto(config["timesheet_url"])
    page.wait_for_load_state("networkidle")


def process_entries(page: Page, config: dict, data: list[list[str]]) -> list[str]:
    """Iterate over all rows and fill timesheet entries. Returns a list of error messages."""
    errors = []

    for date, _, task, remarks, hours in data:
        print(f"\nProcessing — Date: {date} | Task: {task} | Hours: {hours}")
        try:
            fill_entry(page, config, date, task, remarks, hours)
        except Exception as e:
            msg = f"Task: {task} | Date: {date} | Error: {e}"
            print(f"  ERROR: {msg}")
            errors.append(msg)
            page.pause()  # Pause for debugging — remove in production
            break  # Switch to `continue` to skip bad rows instead of stopping

    return errors


def report_results(page: Page, errors: list[str]) -> None:
    if errors:
        print(f"\nCompleted with {len(errors)} error(s):")
        for err in errors:
            print(f"  - {err}")
        page.pause()
    else:
        print("\nAll entries completed successfully!")


# =========================
# MAIN
# =========================
def main():
    config = load_config()

    data = load_clipboard_data()
    print_data(data, label="Parsed clipboard data")

    # sys.exit(0)  # Uncomment to verify data before running automation

    with sync_playwright() as p:
        browser = launch_browser(p)
        page = browser.new_page()
        block_media(page)

        try:
            login(page, config)
            open_timesheet(page, config)
            errors = process_entries(page, config, data)
            report_results(page, errors)

        except Exception as e:
            print(f"\nFATAL ERROR: {e}")
            page.pause()

        finally:
            time.sleep(3)
            browser.close()
            print("Browser closed.")


if __name__ == "__main__":
    main()
