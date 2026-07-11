import json
import os
import time
import traceback
from datetime import datetime
from playwright.sync_api import sync_playwright, Page

# ── Config ────────────────────────────────────────────────────────────────────

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

if not os.path.exists(CONFIG_PATH):
    raise FileNotFoundError(f"config.json not found at: {CONFIG_PATH}")

with open(CONFIG_PATH) as f:
    config = json.load(f)

print(f"Config loaded: {CONFIG_PATH}")

# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_date(raw: str) -> datetime | None:
    """Parse a date string in common formats."""
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y"):
        try:
            return datetime.strptime(raw.strip(), fmt)
        except ValueError:
            continue
    print(f"  [WARN] Could not parse date: '{raw}'")
    return None


def navigate(page: Page, url: str) -> None:
    """Go to URL and wait for page to settle."""
    print(f"  → {url}")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_load_state("networkidle", timeout=60_000)
    except Exception:
        print("  [WARN] Page load timed out — continuing anyway")


def select_calendar_date(page: Page, input_locator, date: datetime) -> None:
    """
    Click a date input to open the ASP.NET CalendarExtender,
    then click the visible matching day cell.

    Expected calendar title format: 'Saturday, May 23, 2026'
    """
    formatted = date.strftime("%A, %B %d, %Y")
    print(f"  Selecting date: {formatted}")

    input_locator.click()
    page.wait_for_timeout(500)

    page.locator(f'[title="{formatted}"]:visible').click()
    page.wait_for_timeout(300)


def unlock_table(page: Page) -> None:
    """Remove inline overflow/size restrictions on the task grid wrapper."""
    page.evaluate("""
        () => {
            const wrapper = document.querySelector('#MainContent_gvABAPDevDetailsWrapper');
            if (!wrapper) return;
            [wrapper, ...wrapper.querySelectorAll('*')].forEach(el => {
                ['width','height','overflow','overflow-x','overflow-y',
                 'max-height','max-width'].forEach(prop => {
                    el.style.removeProperty(prop);
                });
            });
        }
    """)

# ── Main ──────────────────────────────────────────────────────────────────────

with sync_playwright() as p:

    browser = p.chromium.launch_persistent_context(
        user_data_dir = os.path.join(BASE_DIR, "user_data"),
        channel       = "msedge",
        headless      = False,
        slow_mo       = 300,
    )
    page   = browser.new_page()
    errors        = []           # genuine failures (row NOT saved)
    no_email_rows = []           # saved OK, but portal couldn't send the notification email
    failed_keys   = set()        # rows to skip so we don't retry a broken row forever
    page.on("dialog", lambda d: d.accept())

    try:
        # ── Login ─────────────────────────────────────────────────────────────
        navigate(page, config["url"])
        page.get_by_role("textbox", name="Email").fill(config["username"])
        page.get_by_role("textbox", name="Password").fill(config["password"])
        page.get_by_role("button",  name="Submit").click()
        page.wait_for_load_state("networkidle", timeout=60_000)
        print("Login successful")

        # ── Process rows ──────────────────────────────────────────────────────
        for iteration in range(1, 201):   # max 200 rows safety cap

            navigate(page, config["abap_task_url"])
            unlock_table(page)

            not_started = page.locator(
                "#MainContent_gvABAPDevDetails td:has-text('Not Started')"
            )
            count = not_started.count()
            print(f"\n[{iteration}] 'Not Started' rows found: {count}")

            if count == 0:
                print("All done — no more 'Not Started' rows.")
                break

            # Pick the first 'Not Started' row we haven't already failed on.
            # (A row the portal refuses to save stays 'Not Started', so without
            #  this guard we'd retry the same broken row forever.)
            row = row_key = None
            for i in range(count):
                candidate = not_started.nth(i).locator("xpath=ancestor::tr[1]")
                key = candidate.inner_text().strip()
                if key not in failed_keys:
                    row, row_key = candidate, key
                    break

            if row is None:
                print(f"No processable 'Not Started' rows left "
                      f"({len(failed_keys)} skipped due to portal errors).")
                break

            edit_link = row.locator("[id*='lnkEdit']")

            if not edit_link.is_visible():
                errors.append(f"[{iteration}] Edit link not visible — stopping.")
                print(f"  {errors[-1]}")
                page.pause()
                break

            try:
                # Open edit popup
                edit_link.click()
                page.wait_for_load_state("networkidle", timeout=60_000)
                page.wait_for_timeout(600)

                # Read planned dates
                start_raw  = page.locator("#MainContent_Txt_PlannedPreparationStart").input_value().strip()
                finish_raw = page.locator("#MainContent_txt_PlannedPreparationFinish").input_value().strip()

                start_date  = parse_date(start_raw)
                finish_date = parse_date(finish_raw)

                print(f"  Planned Start : {start_raw}  →  {start_date}")
                print(f"  Planned Finish: {finish_raw}  →  {finish_date}")

                if not start_date:
                    raise ValueError(f"Unreadable start date: '{start_raw}'")
                if not finish_date:
                    raise ValueError(f"Unreadable finish date: '{finish_raw}'")

                # Set status
                page.locator("#MainContent_AllStatus").select_option("10")
                page.wait_for_timeout(300)

                # Set actual submission date (calendar)
                select_calendar_date(
                    page,
                    page.locator("#MainContent_Txt_RevisedActualSubmission"),
                    start_date
                )

                # Set actual approval date (calendar)
                select_calendar_date(
                    page,
                    page.locator("#MainContent_txt_RevisedActualApproval"),
                    finish_date
                )

                # Submit
                page.get_by_role("link", name="Submit").click()
                page.wait_for_load_state("networkidle", timeout=60_000)
                page.wait_for_timeout(800)

                # The portal saves the status change BEFORE it sends the
                # notification email. So if it lands on the "A recipient must be
                # specified" error, the data is ALREADY saved — only the email
                # failed. The row has left 'Not Started', so it's really done.
                body = page.content()
                if "A recipient must be specified" in body:
                    no_email_rows.append(row_key.split("\n")[0].strip())
                    print(f"  ✓ Row {iteration} saved "
                          f"(⚠ no notification email sent — reported)")
                    continue

                # Any OTHER server error page: save state is unknown, so skip
                # this row (don't retry forever) and flag it as a real failure.
                if "Server Error in '/" in body:
                    failed_keys.add(row_key)
                    msg = (f"[{iteration}] Unexpected portal error on save — "
                           f"skipping row: {row_key[:120]!r}")
                    errors.append(msg)
                    print(f"  [SKIP] {msg}")
                    continue

                print(f"  ✓ Row {iteration} submitted")

            except Exception:
                failed_keys.add(row_key)   # don't retry this row forever
                msg = f"[{iteration}] {traceback.format_exc()}"
                errors.append(msg)
                print(f"  [ERROR]\n{msg}")
                continue   # skip bad row and keep going

    except Exception:
        print(f"\nFATAL:\n{traceback.format_exc()}")
        page.pause()

    finally:
        # Rows that saved fine but whose notification email couldn't be sent.
        if no_email_rows:
            out_path = os.path.join(BASE_DIR, "saved_without_email.txt")
            with open(out_path, "w", encoding="utf-8") as fh:
                fh.write("\n".join(no_email_rows))
            print(f"\n{len(no_email_rows)} row(s) saved OK but sent NO "
                  f"notification email (missing recipient — forward to HRMS):")
            for r in no_email_rows:
                print(f"  • {r}")
            print(f"  → list written to {out_path}")

        if errors:
            print(f"\nCompleted with {len(errors)} real error(s):")
            for e in errors:
                print(f"  • {e}")
        elif not no_email_rows:
            print("\nAll rows processed successfully!")

        time.sleep(3)
        browser.close()
        print("Browser closed.")