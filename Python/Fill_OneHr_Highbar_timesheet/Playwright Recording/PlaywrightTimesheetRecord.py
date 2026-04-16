import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto("https://ess.highbartech.com/hrms/login.aspx")
    page.get_by_role("textbox", name="Email").click()
    page.get_by_role("textbox", name="Email").fill("Jayasurya.Lakkoju@highbartech.com")
    page.get_by_role("textbox", name="Password").fill("Highbar@12345678")
    page.get_by_role("button", name="Submit").click()
    page.locator("#divkeypersnolN > a").click()
    page.goto("https://ess.highbartech.com/hrms/procs/Timesheet.aspx")
    page.get_by_role("link", name="Record Timesheet").click()
    page.locator("#MainContent_txtFromdate").click()
    page.get_by_title("Monday, April 13,").click()
    page.get_by_title("Please select project").click()
    page.locator("input[type=\"search\"]").fill("ALIM")
    page.get_by_role("treeitem", name="ALIMCO-CR - Alimco CR").click()
    page.get_by_title("Please select task").click()
    page.get_by_role("treeitem", name="Lunch").click()
    page.locator("#MainContent_txtHours").click()
    page.locator("#MainContent_txtHours").fill("01:00")
    page.locator("#MainContent_txtHours").click()
    page.locator("#MainContent_txtHours").fill("00:30")
    page.locator("#MainContent_txtDescription").click()
    page.locator("#MainContent_txtDescription").fill("LUNCH.")
    page.once("dialog", lambda dialog: dialog.dismiss())
    # page.get_by_role("link", name="Submit").click()
    page.goto("https://ess.highbartech.com/hrms/procs/TimesheetRecord.aspx")

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
