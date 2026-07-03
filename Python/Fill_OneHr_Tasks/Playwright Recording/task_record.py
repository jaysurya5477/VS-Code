import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context(ignore_https_errors=True, viewport={"width":1600,"height":900})
    page = context.new_page()
    page.goto("https://ess.highbartech.com/hrms/login.aspx")
    page.get_by_role("textbox", name="Email").click()
    page.get_by_role("textbox", name="Email").fill("Jayasurya.Lakkoju@highbartech.com")
    page.get_by_role("textbox", name="Password").click()
    page.get_by_role("textbox", name="Password").fill("Highbar@12345678")
    page.get_by_role("button", name="Submit").click()
    page.get_by_role("link", name="Notifications (3)").click()
    page.get_by_role("link", name="ABAP Development Pending (3)").click()
    page.get_by_role("cell", name="Not Started").nth(3).click()
    page.locator("#MainContent_gvABAPDevDetailsFreeze").get_by_role("cell", name="Target, qty, amount mismatch").click()
    page.locator("#MainContent_gvABAPDevDetailsFreeze > tbody > tr:nth-child(226) > td").first.click()
    page.locator("#MainContent_LinkButton2").click()
    page.locator("#MainContent_gvABAPDevDetailsVerticalBar").click()
    page.locator("#MainContent_gvABAPDevDetailsVerticalBar").click()
    page.locator("#MainContent_gvABAPDevDetailsVerticalBar").click()
    page.locator("#MainContent_gvABAPDevDetailsVerticalBar").click()
    page.get_by_role("row", name="Submit Target, qty, amount mismatch on Production dashboard, also getting duplicate entries for all the categories Not Started", exact=True).locator("#MainContent_gvABAPDevDetails_lnkEdit_224").click()
    page.locator("#MainContent_LinkBtnBackPopup").click()
    page.get_by_role("row", name="Submit Target, qty, amount mismatch on Production dashboard, also getting duplicate entries for all the categories Not Started", exact=True).locator("#MainContent_gvABAPDevDetails_lnkEdit_224").click()
    page.locator("#MainContent_editform1").get_by_role("listitem").filter(has_text="Planned Start Date").click()
    page.locator("#MainContent_txt_PlannedPreparationFinish").dblclick()
    page.locator("#MainContent_AllStatus").select_option("10")
    page.goto("https://ess.highbartech.com/hrms/procs/ABAP_Object_Tracker_Change_Status_ABAP.aspx")
    page.locator("#MainContent_editform1").get_by_role("listitem").filter(has_text="Planned Start Date").click()
    page.locator("#MainContent_Txt_RevisedActualSubmission").click()
    page.get_by_text("15", exact=True).click()
    page.locator("#MainContent_editform1").get_by_role("listitem").filter(has_text="Revised Finish Date").click()
    page.locator("body").press("ControlOrMeta+c")
    page.locator("#MainContent_txt_RevisedActualApproval").click()
    page.locator("#MainContent_CalendarExtender4_day_2_5").click()
    page.once("dialog", lambda dialog: dialog.dismiss())
    page.get_by_role("link", name="Submit").click()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
