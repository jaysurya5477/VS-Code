# -*- coding: utf-8 -*-
import sys
from docbuild import Doc

d = Doc("Plant & Material Wise Sales Dashboard",
        "User Manual",
        "Application: ZSD_PMS_DASH   |   Version 1.0   |   August 2026")

# ============================================================== 1 ============
d.h1("1.  Welcome")
d.p("The Plant & Material Wise Sales Dashboard shows you, on one screen, what has been billed in "
    "a fiscal year — the net value, the GST on it and the gross — and breaks that down by "
    "plant, by material, by scheme and by where in India it came from. Every figure is compared "
    "against the same period of the previous year.")
d.p("The dashboard only shows you information. You cannot change any figure from this screen, and "
    "nothing you do here affects SAP in any way.")

d.h2("1.1  What You Will See")
d.table(["Area", "What it tells you"], [
    ["Filter bar", "Fiscal year, zone, state, plant, scheme, material and period — plus the Go button that applies them"],
    ["Four KPI cards", "Total net value, total GST, total gross, and one single day's gross sale"],
    ["Sales across India", "A map of India shaded by value, with optional dots for each Unit"],
    ["Scheme performance", "Your schemes ranked by value, and beneath them the top states"],
    ["Sales by plant", "The 20 highest-billing plants, showing net and tax stacked together"],
    ["Sales by material", "The 20 highest-selling materials by value"],
])

d.h2("1.2  A Note on the Numbers")
d.bullets([
    "All values are in Indian Rupees.",
    "Large figures are shown in Crore (\"Cr\") and Lakh (\"L\"). ₹ 12.50 Cr means twelve and a half crore rupees.",
    "\"Net\" is the value before tax. \"Gross\" is net plus GST.",
    "A fiscal year runs April to March, and is named after the year it STARTS in — April 2026 to March 2027 is FY 2026-27.",
    "Periods are counted the way the business counts them: April is the first period, March is the twelfth.",
])

# ============================================================== 2 ============
d.h1("2.  Opening the Dashboard")
d.numbers([
    "Open the SAP Fiori Launchpad in your browser and sign in as usual.",
    "Find and click the tile for the Plant & Material Wise Sales Dashboard.",
    "Wait a moment while the dashboard loads. A busy indicator appears while it fetches your data.",
    "The dashboard opens on the current fiscal year with no other filters applied — that is, everything.",
])
d.callout("If it stays busy", "Give it a few seconds — the first load fetches nine sets of "
          "figures at once. If nothing appears at all, or a red message bar appears across the "
          "top, note what it says and contact your SAP support team.")
d.p("You can switch the screen between Auto, Light and Dark appearance using the control in the "
    "top-right corner. This changes only how the screen looks, never the figures.")

# ============================================================== 3 ============
d.h1("3.  Using the Filters")
d.p("The filter bar runs across the top of the screen.")

d.h2("3.1  Nothing Happens Until You Press Go")
d.p("This is the most important thing to know about the filter bar. Changing a filter does NOT "
    "reload the screen. You can set the year, pick three states, pick a scheme and pick two "
    "materials, and the dashboard will keep showing your previous result the whole time. It "
    "refreshes only when you press Go.")
d.p("While you have unapplied changes, the Go button is highlighted. That highlight is your "
    "reminder that what you are looking at is not yet what you have selected.")
d.callout("Why it works this way", "Narrowing down usually means touching several filters in a "
          "row. If the screen reloaded on every click, you would sit through a full refresh after "
          "each one — and watch every panel redraw underneath you — before you had "
          "finished choosing.")
d.p("Two things behave differently. The dashboard loads by itself when you first open it, and "
    "Reset clears every filter and refreshes at once.")

d.h2("3.2  The Filters")
d.table(["Filter", "What it does"], [
    ["Fiscal Year", "Chooses the year. One year only — it cannot be left empty. Offers up to the three most recent years, but never one older than 2026-27 (older billing cannot be split by zone)."],
    ["Zone", "Narrows to one or more of North, West, South, East and Central."],
    ["State", "Narrows to one or more states."],
    ["Plant", "Narrows to one or more billing plants."],
    ["Scheme", "Narrows to one or more schemes, such as ADIP or ADIP SSA."],
    ["Material", "Narrows to one or more materials."],
    ["Period", "Narrows to particular months, April through March."],
])
d.p("Every filter except Fiscal Year accepts any number of values and has a Select all option. "
    "Leaving a filter empty means \"include everything\" — it does not mean \"exclude "
    "everything\".")

d.h2("3.3  Finding What You Need in a Long List")
d.p("Start typing in any of the filter boxes to narrow the list. The Plant, Material, State and "
    "Scheme lists show the code beside the description, so you can search by either.")
d.callout("Searching by old material number", "If you know a material only by its old code, type "
          "that. The Material filter shows the old number beside each material and searches on it "
          "as well as on the current code and the description.")
d.p("One thing to expect: the State, Plant, Scheme and Material lists GROW as you widen your "
    "selection. They are built from what the dashboard has actually returned so far, so a plant "
    "that has not appeared in any of your results yet will not be in the list until it does.")

d.h2("3.4  Clicking the Screen Is Also Filtering")
d.p("You do not have to use the filter bar. You can click:")
d.bullets([
    "a state on the map — adds or removes that state in the State filter",
    "a zone on the map, when the map is in Zone mode — adds or removes that zone",
    "a scheme row in the Scheme performance panel — adds or removes that scheme",
    "a row in the Top states list — adds or removes that state",
])
d.p("Clicking the same thing a second time removes it again, rather than replacing everything you "
    "had selected. And like any other filter change, these clicks wait for Go.")

d.h2("3.5  When You See \"No Data\"")
d.p("If a panel shows \"No data\", your current combination of filters has no sales in it. That is "
    "not an error. Widen or clear a filter — or press Reset to start again.")

# ============================================================== 4 ============
d.h1("4.  Reading the KPI Cards")
d.p("Four cards sit just below the filter bar. All four follow your filters. The first three "
    "show a small percentage pill comparing themselves against last year; the fourth, which "
    "reports a single day, does not. See 4.5 for when the pills are hidden altogether.")

d.h2("4.1  Total Net Value")
d.p("Everything billed in your selection, before tax. Beneath the abbreviated figure you will see "
    "the same amount written out in full.")

d.h2("4.2  Total Tax (GST)")
d.p("The GST on the same selection. Beneath it you will see the effective rate — the tax as "
    "a percentage of the net value.")

d.h2("4.3  Total Gross Value")
d.p("Net value plus GST. This card always equals the first two added together.")

d.h2("4.4  Yesterday Sale / Month-End Sale")
d.p("A single day's billing as a GROSS figure, not a total for the year. Which day it reports on depends on what "
    "you have filtered, and the card renames itself to tell you:")
d.table(["What you have selected", "The card shows"], [
    ["The current year, no period picked", "Yesterday — titled \"Yesterday Sale\""],
    ["The current year with the current month picked", "Yesterday — titled \"Yesterday Sale\""],
    ["Any other month or months", "The last day of the latest month you picked — titled \"Month-End Sale\""],
    ["A past year with no month picked", "31 March of that year — titled \"Month-End Sale\""],
])
d.p("Beneath the value you will see the exact date and how many invoices were billed on it, and "
    "below that, in smaller type, the net and the GST that make up the gross. If the day has not "
    "happened yet, the card says there was no billing rather than showing a zero.")

d.h2("4.5  About the Percentage Pills")
d.p("A pill compares your selection against the same measure last year. You will see one on the "
    "three money cards, on each scheme row and on each of the top states.")
d.callout("Why growth looks sensible mid-year", "When you are looking at the CURRENT year, the "
          "dashboard compares you against the same point in last year — five months against "
          "last year's first five months, not against last year's full twelve. Without this, every "
          "figure on the screen would look disastrous until March. When you look at a past, "
          "completed year, the two full years are compared.")
d.p("A pill reading \"new\" means there was nothing at all in the comparison period, so a "
    "percentage cannot be calculated.")
d.callout("Why the single-day card has no pill", "It reports one day against the same day a year "
          "earlier. If either of those two days happened to be a holiday, the percentage says "
          "more about the calendar than about sales, so it is not shown at all.")
d.callout("Why the pills disappear for the whole of 2026-27", "The Unit and Zone grouping the "
          "dashboard uses came into effect this year, so most of last year's records do not carry "
          "it. Comparing this year against last year would mean comparing an almost complete year "
          "against an almost empty one, which reports growth in the thousands of percent — and "
          "that is true whether or not you have narrowed the view with any other filter. Rather "
          "than show you a figure that is not true, the dashboard hides the pills for the whole of "
          "2026-27, filtered or not. Select a different fiscal year and they come back. From "
          "2027-28 onwards this stops happening by itself.")
d.p("Your figures themselves are never affected either way — only the comparison is withheld.")

# ============================================================== 5 ============
d.h1("5.  Reading the Map")
d.p("The \"Sales across India\" panel has two layers that work independently.")

d.h2("5.1  The Shaded Map")
d.p("Each state is shaded according to how much was billed there. Use the State / Zone switch to "
    "change what is shaded: individual states, or the zones they belong to. In Zone mode a zone is "
    "drawn as one continuous area, so you see the zone rather than the states inside it.")
d.callout("A zone is a business grouping, not a region of the map", "Zones are not drawn from "
          "where a state sits on the map: 2000 HQ is in Kanpur, in Uttar Pradesh, but belongs to "
          "Central — so in Zone mode Uttar Pradesh is shaded as part of Central, and a zone can "
          "cover areas that are nowhere near each other. Everywhere else on the screen — the Zone "
          "filter, the KPI totals, the scheme rows — a Unit's zone comes from the zone code "
          "maintained against it in SAP. As of August 2026 the map's own shading is the one "
          "exception: it reads each state's zone from a fixed list built into the dashboard "
          "instead, because the SAP-maintained code was occasionally showing a state under the "
          "wrong zone on the map. If a Unit's TOTALS show under the wrong zone anywhere else on "
          "the screen, its zone code in SAP is what needs correcting; if only the MAP shading "
          "looks wrong for a state, tell your SAP support team which state and which zone it "
          "should be.")
d.p("The colour scale sits below the map, labelled with real rupee values so you can read what "
    "each shade is worth. States with no billing at all get their own separate colour, so you can "
    "tell \"nothing\" apart from \"very little\".")
d.callout("Shades darkened slightly in August 2026", "The lightest shade and the \"no billing\" "
          "colour used to sit close enough to the panel's own white background that a "
          "barely-billed state and an unbilled state could both look blank. Both are now a little "
          "darker so each reads clearly against the white panel, as well as against each other.")
d.callout("Why the darkest states are not always the biggest jump", "The colours are spread so "
          "that roughly the same NUMBER of states falls into each shade. If the scale were spread "
          "evenly by value instead, one or two very large states would push everything else into "
          "a single pale colour and the map would tell you nothing.")

d.h2("5.2  The Unit Dots")
d.p("Switch \"Unit dots\" on and a dot appears for each Unit, sized by how much that Unit billed. "
    "A line runs from each dot out to a label in the margin showing the Unit code, the Unit name "
    "and the value.")
d.callout("A dot bigger than the colour scale is normal", "The colour scale describes STATES (or "
          "zones). The dots describe UNITS, which are a different thing entirely — one Unit "
          "can easily be worth more than any single state. The two are not meant to line up.")
d.callout("A dot sits where the Unit is, not where its zone is", "Dots are placed from the Unit's "
          "real location. 2000 HQ is drawn at Kanpur because that is where it is, even though its "
          "zone is Central. Position is geography; colour is the business zoning.")
d.p("If a Unit you expect is not on the map, its location has not been maintained in the system. "
    "Its sales still count everywhere else on the screen. Ask your SAP support team to add its "
    "coordinates.")

d.h2("5.3  Hovering for Detail")
d.p("Hover over any state, zone or dot and a small card appears showing three figures: the gross "
    "billed value, and the net and the GST that make it up. On a state, the zone it belongs to is "
    "named above it.")
d.callout("The card used to show more", "Growth against last year, share of India, and the "
          "number of plants and invoices were removed in August 2026 to keep the card readable. "
          "Invoice counts and growth are still on each scheme row in the panel to the right.")

# ============================================================== 6 ============
d.h1("6.  Reading the Other Panels")

d.h2("6.1  Scheme Performance")
d.p("Your schemes, ranked by gross value. Each row shows a colour chip, the value, a bar showing its "
    "share of the total, that share as a percentage, how many invoices it covers, and its growth "
    "against last year. Schemes with nothing in your current selection are not listed at all.")
d.p("The panel's subtitle usually names the year it is comparing against — \"Gross value by "
    "scheme · vs FY {year}\". Whenever the percentage pills are hidden for the reason given in "
    "4.5, the subtitle drops back to a plain \"Gross value by scheme\", so it never promises a "
    "comparison the rows are not making.")
d.p("Beneath the divider is the Top states roll-up. Both the scheme rows and the state rows are "
    "clickable and filter the screen.")

d.h2("6.2  Sales by Plant")
d.p("The 20 highest-billing plants. Each bar is stacked — the net value and the tax on top of "
    "it — so the whole bar is the gross. The plant's city is shown beside its code.")
d.callout("Only 20, but you can still filter on any", "The panel is capped at 20 so it stays "
          "readable. The Plant filter is not capped — it lists every plant that billed "
          "anything in your current scope, which is far more than twenty. The same applies to "
          "materials. If either list ever stops at exactly 100 entries, report it: that is a known "
          "failure mode that was fixed, not a real limit.")

d.h2("6.3  Sales by Material")
d.p("The 20 highest-selling materials by gross value, with the quantity, the unit of measure and "
    "the GST breakdown available for each.")
d.p("Two things about this panel differ from the rest of the screen, and both are worth knowing "
    "when your numbers do not tie up:")
d.bullets([
    "Credit memos are excluded here, but not from the KPI cards. The material panel therefore reports invoiced value only.",
    "The Scheme filter does not narrow this panel. If you filter to one scheme, every other panel narrows but this one keeps showing all materials in the remaining scope.",
])
d.callout("Why the percentages do not add up to 100", "That is correct. Each material's share is "
          "calculated against EVERY material in your selection, not just the twenty shown — "
          "so the twenty listed should add up to less than 100%.")

# ============================================================== 7 ============
d.h1("7.  Common Tasks")
d.table(["I want to…", "Do this"], [
    ["See last year instead", "Change Fiscal Year, then press Go."],
    ["Look at one zone", "Pick it in the Zone filter, then press Go. Or switch the map to Zone mode and click it."],
    ["Look at one state", "Click it on the map, or pick it in the State filter — then press Go."],
    ["Compare two or three states", "Click each one on the map in turn, then press Go."],
    ["See a single month", "Pick it in the Period filter, then press Go."],
    ["See a quarter", "Pick the three months together in the Period filter, then press Go."],
    ["Focus on one scheme", "Click its row in the Scheme performance panel, then press Go."],
    ["Find a material by its old code", "Type the old code into the Material filter's search box."],
    ["See which Unit sells most", "Switch Unit dots on and compare the dot sizes, or hover each one."],
    ["Check yesterday's billing", "Read the fourth KPI card with the current year selected and no period filter."],
    ["Start over", "Press Reset. This clears everything and refreshes immediately."],
    ["Refresh without changing anything", "Press the refresh button beside Reset."],
])

# ============================================================== 8 ============
d.h1("8.  Questions and Answers")

qa = [
    ("I changed a filter and nothing happened.",
     "That is correct behaviour. Filters are staged so you can set several at once without a "
     "reload after each click. Press Go to apply them — the Go button is highlighted "
     "whenever you have changes waiting."),
    ("The dashboard doesn't match the sales report I usually run.",
     "Check three things in order. First, net versus gross — make sure you are comparing "
     "like with like. Second, your filters, including the fiscal year and any period. Third, if "
     "you are comparing against the material panel specifically, remember that it excludes credit "
     "memos."),
    ("The material panel's total doesn't match the Total net value card.",
     "Two usual reasons: the material panel excludes credit memos and the card does not, and the "
     "panel shows only the top 20 materials while the card totals everything. Also check net "
     "against gross — the material panel is ranked by gross."),
    ("I filtered to a zone and the material panel went empty.",
     "That is correct, and it is what the panel should do. If none of the materials you selected "
     "sold in that zone, the panel reports no material for the current selection rather than "
     "quietly falling back to showing every material in the country."),
    ("A Unit is missing from the map.",
     "Its location has not been maintained in the system, so the dashboard leaves it off rather "
     "than placing it somewhere wrong. Its sales are still counted in every other panel. Ask your "
     "SAP support team to maintain its coordinates."),
    ("A dot is bigger than anything on the colour scale. Is that a mistake?",
     "No. The scale measures states or zones; the dots measure Units. A Unit covers several plants "
     "and can easily be worth more than any single state."),
    ("Growth on one scheme or state shows a huge percentage. Is it real?",
     "Check what it billed last year. Where last year's figure was very small, even a modest "
     "increase produces an enormous percentage. Where there was nothing at all last year, you "
     "will see \"new\" instead of a number."),
    ("The percentage pills are missing. Is something broken?",
     "No, and your figures are unaffected. For the whole of fiscal year 2026-27 the dashboard "
     "hides the pills, filtered or not, because last year's records do not carry the Unit and "
     "Zone grouping and the comparison would be wildly wrong. Select a different fiscal year to "
     "get them back. See 4.5."),
    ("Why does the Plant filter list far more plants than the plant panel shows?",
     "The panel deliberately shows only the top 20 so it stays readable. The filter deliberately "
     "lists everything, so you can select any plant that billed."),
    ("Can I pick my own date range?",
     "Not directly. The fiscal year always runs April to March. Use the Period filter to narrow "
     "down to particular months within it."),
    ("Can I export this to Excel?",
     "Not from this screen. The dashboard is a visual summary. For line-item detail, use your "
     "usual SAP sales report."),
    ("Can I see sales by customer?",
     "Not on this dashboard. It is built around plant, material, scheme and geography."),
    ("The GST figures on the material panel are all zero.",
     "This is a configuration issue rather than missing data. Report it to your SAP support team, "
     "who will need to check which pricing conditions the dashboard is reading."),
    ("A panel looks blank or squashed.",
     "Try resizing your browser window or refreshing the page. The panels resize themselves to the "
     "window, and an unusual zoom level can occasionally leave one mis-sized."),
    ("Who do I contact if something looks wrong?",
     "Your SAP support team. It helps them a great deal if you tell them the fiscal year, and "
     "which zone, state, plant, scheme, material and period you had selected when you saw the "
     "problem — the SCOPE line at the top of the screen summarises exactly that."),
]
for q, a in qa:
    d.h3(q)
    d.p(a)

d.save(sys.argv[1])
print("UM written")
