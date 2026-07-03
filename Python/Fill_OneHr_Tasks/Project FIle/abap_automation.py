import json
import os
import time, traceback
from datetime import datetime
from turtle import pd
from playwright.sync_api import sync_playwright, Page

# =========================
# RESOLVE BASE DIRECTORY
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# =========================
# LOAD CONFIG
# =========================
config_path = os.path.join(BASE_DIR, "config.json")

if not os.path.exists(config_path):
    raise FileNotFoundError(
        f"config.json not found at: {config_path}\n"
        "Make sure config.json is in the SAME folder as this script."
    )

with open(config_path) as f:
    config = json.load(f)

print(f"\n Config loaded from: {config_path}")


# =========================
# DATE HELPERS
# =========================
def parse_date(raw: str) -> datetime | None:
    """Try common date formats used in ASP.NET portals."""
    formats = ["%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y"]
    for fmt in formats:
        try:
            return datetime.strptime(raw.strip(), fmt)
        except ValueError:
            continue
    print(f"  [WARN] Could not parse date: '{raw}'")
    return None


from datetime import datetime

def select_calendar_date(page, input_locator, target_date_str: str) -> None:
    """
    Select date from ASP.NET CalendarExtender.

    Input format:
        09/05/2026

    Converted display format:
        Saturday, May 09, 2026
    """

    # Convert string to datetime
    # target = datetime.strptime(str(target_date_str).strip(), "%d/%m/%Y")
    target = datetime.strptime(str(target_date_str).strip().split(' ')[0], "%Y-%m-%d")

    # Optional formatted text
    formatted_date = target.strftime("%A, %B %d, %Y")
    print(f"Selecting Date : {formatted_date}")

    # Open calendar
    input_locator.click()
    page.wait_for_timeout(500)

    page.locator(f'[title="{formatted_date}"]:visible').click()

    # # Navigate to correct month/year
    # for _ in range(24):

    #     header = page.locator(
    #         ".ajax__calendar_header .ajax__calendar_title"
    #     ).inner_text().strip()

    #     try:
    #         displayed = datetime.strptime(header, "%B, %Y")
    #     except ValueError:
    #         displayed = datetime.strptime(
    #             header.replace(" ", ", ", 1),
    #             "%B, %Y"
    #         )

    #     if displayed.year == target.year and displayed.month == target.month:
    #         break

    #     if (displayed.year, displayed.month) < (target.year, target.month):
    #         page.locator(".ajax__calendar_next").click()
    #     else:
    #         page.locator(".ajax__calendar_prev").click()

    #     page.wait_for_timeout(300)

    # # Click correct day
    # day_cells = page.locator(".ajax__calendar_day")

    # for i in range(day_cells.count()):

    #     cell = day_cells.nth(i)

    #     if cell.inner_text().strip() == str(target.day):

    #         classes = cell.get_attribute("class") or ""

    #         if "ajax__calendar_other" not in classes:
    #             cell.click()
    #             page.wait_for_timeout(300)

    #             print(f"Selected : {formatted_date}")
    #             return

    # raise RuntimeError(
    #     f"Day {target.day} not found in calendar for "
    #     f"{target.strftime('%B %Y')}"
    # )

# =========================
# NAVIGATION HELPER
# =========================
def safe_goto(page: Page, url: str) -> None:
    """
    Navigate to a URL with a generous timeout.
    Uses 'domcontentloaded' instead of 'load' so we don't wait for
    slow third-party scripts/ads that never finish on ASP.NET portals.
    Falls back gracefully if even that times out (e.g. flaky network).
    """
    print(f"  → Navigating to: {url}")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=90_000)
    except Exception:
        # Page may still be usable even if some resources timed out
        print("  [WARN] goto timed out — continuing anyway (page may still be loaded)")


def wait_for_page(page: Page) -> None:
    """Wait for network to settle, with a generous timeout for slow portals."""
    try:
        page.wait_for_load_state("networkidle", timeout=60_000)
    except Exception:
        print("  [WARN] networkidle timed out — continuing anyway")


# =========================
# PLAYWRIGHT FLOW
# =========================
with sync_playwright() as p:
    browser = p.chromium.launch_persistent_context(
        user_data_dir=os.path.join(BASE_DIR, "user_data"),  # keeps session alive between runs
        channel="msedge",
        headless=False,
        slow_mo=300,
    )

    page = browser.new_page()

    # Block images/media/fonts to speed up page loads
    # page.route(
    #     "**/*",
    #     lambda route: route.abort()
    #     if route.request.resource_type in ["image", "media", "font"]
    #     else route.continue_()
    # )

    errors = []  # collect row-level errors instead of crashing immediately

    try:
        # ------------------------------------------------------------------
        #  LOGIN
        # ------------------------------------------------------------------
        safe_goto(page, config["url"])
        page.get_by_role("textbox", name="Email").fill(config["username"])
        page.get_by_role("textbox", name="Password").fill(config["password"])
        page.get_by_role("button", name="Submit").click()
        wait_for_page(page)
        print(" Login successful")

        # ------------------------------------------------------------------
        #  NAVIGATE TO ABAP TASK PAGE
        # ------------------------------------------------------------------
        safe_goto(page, config["abap_task_url"])
        wait_for_page(page)
        print(f" Opened ABAP Task page: {config['abap_task_url']}")

        # ------------------------------------------------------------------
        #  MAIN LOOP — process every "Not Started" row
        # ------------------------------------------------------------------
        iteration = 0
        max_iterations = 200  # safety cap

        while iteration < max_iterations:
            iteration += 1

            # Always reload to get the freshest table state after each submit
            safe_goto(page, config["abap_task_url"])
            wait_for_page(page)

            page.evaluate("""
            () => {
                const wrapper = document.querySelector('#MainContent_gvABAPDevDetailsWrapper');

                if (wrapper) {

                    // Include parent + all child elements
                    const elements = [wrapper, ...wrapper.querySelectorAll('*')];

                    elements.forEach(el => {

                        // Remove inline styles
                        el.style.removeProperty('width');
                        el.style.removeProperty('height');
                        el.style.removeProperty('overflow');
                        el.style.removeProperty('overflow-x');
                        el.style.removeProperty('overflow-y');
                        el.style.removeProperty('max-height');
                        el.style.removeProperty('max-width');

                        // Force override
                        el.style.setProperty('width', 'auto', 'important');
                        el.style.setProperty('height', 'auto', 'important');
                        el.style.setProperty('overflow', 'visible', 'important');
                        el.style.setProperty('overflow-x', 'visible', 'important');
                        el.style.setProperty('overflow-y', 'visible', 'important');
                        el.style.setProperty('max-height', 'none', 'important');
                        el.style.setProperty('max-width', 'none', 'important');
                    });

                    console.log('Wrapper styles cleaned successfully');
                }
              }
            """)

            # Find all "Not Started" cells in the task grid
            not_started_cells = page.locator(
                "#MainContent_gvABAPDevDetails td:has-text('Not Started')"
            )
            count = not_started_cells.count()
            print(f"\n[LOOP {iteration}] Found {count} 'Not Started' row(s)")

            if count == 0:
                print(" No more 'Not Started' rows — all done!")
                break

            # Always pick the first one (page reloads between submits)
            first_row = not_started_cells.first.locator("xpath=ancestor::tr[1]")
            edit_link = first_row.locator("[id*='lnkEdit']")

            if not edit_link.is_visible():
                msg = f"[LOOP {iteration}] Edit link not visible — stopping to avoid infinite loop."
                print(f"  {msg}")
                errors.append(msg)
                page.pause()  # inspect manually
                break

            try:
                # --- Open the edit popup ---
                edit_link.click()
                wait_for_page(page)
                page.wait_for_timeout(600)
                print(f"  Popup opened")

                # page.pause()  # pause for manual inspection — remove in production
                
                # --- Read Planned Start Date ---
                start_input = page.locator("#MainContent_Txt_PlannedPreparationStart")
                start_raw   = start_input.input_value().strip()
                start_date  = parse_date(start_raw)
                print(f"  Planned Start Date : '{start_raw}' → {start_date}")

                # page.pause()  # pause for manual inspection — remove in production
                if start_date is None:
                    raise ValueError(f"Unreadable Planned Start Date: '{start_raw}'")

                # --- Read Planned Finish Date ---
                finish_input = page.locator("#MainContent_txt_PlannedPreparationFinish")
                finish_raw   = finish_input.input_value().strip()
                finish_date  = parse_date(finish_raw)
                print(f"  Planned Finish Date: '{finish_raw}' → {finish_date}")

                if finish_date is None:
                    raise ValueError(f"Unreadable Planned Finish Date: '{finish_raw}'")

                # --- Set Status ---
                print(f"  Setting status → 'Submit for Functional Testing'")
                page.locator("#MainContent_AllStatus").select_option(
                    "10"  # value for "Submit for Functional Testing" option
                    # label="Submit for Functional Testing"
                )
                page.wait_for_timeout(300)

                # --- Select Start Date on calendar ---
                print(f"  Selecting Start Date on calendar …")
                start_input = page.locator("#MainContent_Txt_RevisedActualSubmission")
                select_calendar_date(page, start_input, start_date)

                # --- Select Finish Date on calendar ---
                print(f"  Selecting Finish Date on calendar …")
                finish_input = page.locator("#MainContent_txt_RevisedActualApproval")
                select_calendar_date(page, finish_input, finish_date)


                # --- Submit ---
                print(f"  Submitting …")
                page.on("dialog", lambda dialog: dialog.accept())
                page.get_by_role("link", name="Submit").click()
                wait_for_page(page)
                page.wait_for_timeout(800)
                print(f"  ✓ Row submitted successfully")

            except Exception as row_error:
                print(f"  [ERROR] {traceback.format_exc()}")
                msg = f"[LOOP {iteration}] Error: {row_error}"
                print(f"   {msg}")
                errors.append(msg)
                page.pause()  # pause for manual inspection — remove in production
                break         # stop on first error; switch to `continue` to skip bad rows

        # ------------------------------------------------------------------
        #  DONE
        # ------------------------------------------------------------------
        if errors:
            print(f"\n Completed with {len(errors)} error(s):")
            for e in errors:
                print(f"   • {e}")
            page.pause()
        else:
            print(f"\n All 'Not Started' rows processed successfully!")

    except Exception as e:
        print(f"\n FATAL ERROR: {e}")
        page.pause()  # pause for debugging — remove in production

    finally:
        time.sleep(3)
        browser.close()
        print("Browser closed.")