# -*- coding: utf-8 -*-
import sys
from docbuild import Doc

d = Doc("Plant & Material Wise Sales Dashboard",
        "Functional Documentation",
        "Application: ZSD_PMS_DASH   |   Version 1.0   |   August 2026")

# ============================================================== 1 ============
d.h1("1.  Business Purpose")
d.p("The Plant & Material Wise Sales Dashboard gives sales and MIS management a single screen "
    "on which to answer four questions for any fiscal year: what have we billed, what did the "
    "tax on it come to, which plants and materials produced it, and where in India did it come "
    "from. It reports billed sales only — net value, GST and gross — broken down by "
    "plant, material, scheme, state, zone and Unit, and compares every figure against the same "
    "period of the previous fiscal year.")
d.p("The dashboard is read-only. It creates no documents, changes no master data and posts "
    "nothing. Every number on the screen is derived from billing data and the plant/zone "
    "configuration that already exist in SAP.")

d.h2("1.1  Intended Audience")
d.bullets([
    "Sales management — tracking net, tax and gross billing against the previous year",
    "Plant and Unit heads — seeing their own plant's or Unit's contribution on the map and the plant ranking",
    "Product and scheme owners — tracking which materials and which schemes are moving",
    "Functional consultants — maintaining the plant/zone/Unit mapping and its coordinates",
    "MIS and reporting teams — reconciling dashboard figures against the underlying billing and sales-register reports",
])

d.h2("1.2  Scope")
d.table(["In scope", "Out of scope"], [
    ["Billed sales — net value, GST and gross — taken from the billing data in ZSD_SALE_ALL",
     "Open orders, deliveries and anything not yet billed"],
    ["Material-level value, quantity and GST split (IGST / SGST / CGST / TCS), taken from the billing items and their pricing conditions",
     "Targets and achievement percentage — this dashboard has no target dimension"],
    ["Plant, state, zone and Unit breakdowns of billed sales",
     "Customer-level analysis — the customer is carried in the data but is not reported on"],
    ["Scheme (category) breakdown, with share of total and year-on-year growth",
     "Forecasting or projection of future sales"],
    ["A single-day snapshot KPI — yesterday, or the selected month's last day",
     "A free date-range picker — the fiscal year always spans Apr 1 to Mar 31"],
    ["Top 20 plants and Top 20 materials by value, with uncapped filter lists behind them",
     "Download or CSV export of the underlying line items"],
])

d.callout("Read the two grains together", "Sales figures on this dashboard come from two "
          "independent extractions of the same billing activity — one at G/L account level "
          "and one at billing-item level. Section 3 explains why, and section 7 lists the two "
          "places where that split is visible to a user.")

# ============================================================== 2 ============
d.h1("2.  Business Dimensions")
d.p("Seven dimensions structure everything on the dashboard. Understanding what each one means "
    "in SAP terms is the key to reading the screen correctly.")

d.h2("2.1  Plant")
d.p("The plant (WERKS) is the billing plant on the sales record. It is the dimension the "
    "“Sales by plant” panel ranks, and it is also what the geography is built on — "
    "a sale is located on the map by its PLANT's state, not by its customer's state. Production "
    "has roughly 109 billing plants.")

d.h2("2.2  Material")
d.p("The material (MATNR) is the article billed, with its billed description (ARKTX), its sales "
    "unit of measure and its old material number (BISMT). Material is the only dimension that "
    "does not come from the G/L-grain sales data — it comes from the billing items — "
    "which is why the Material filter behaves slightly differently from the others (see 7).")
d.callout("Old material number", "A user who only knows a material by its legacy code can still "
          "find it. The old number is shown beside the material in the Material dropdown and the "
          "dropdown's search box matches on it as well as on the code and description.")

d.h2("2.3  Zone")
d.p("A zone is ALIMCO's regional grouping — North, West, South, East and Central. The map "
    "can be switched from state granularity to zone granularity, and the Zone filter narrows "
    "every panel.")
d.callout("Zone comes from ZSD_ZONE_PLANT, not from geography", "A zone is a business grouping, "
          "not a map of India: 2000 HQ sits in Kanpur, in Uttar Pradesh, but belongs to Central. "
          "The dashboard therefore takes the zone from the ALM_ZONE code on the Unit's mapping "
          "row — the same field the Zone filter matches on — so filter and map always "
          "agree. If a Unit appears under the wrong zone, ALM_ZONE is what needs correcting.")
d.p("Because zones are assigned per Unit rather than drawn on the map, a zone need not be one "
    "connected piece of the country. Zone granularity shades each zone's own member states, so "
    "Central covering both Madhya Pradesh and Uttar Pradesh is drawn exactly as the data says. "
    "Zone codes are matched case-insensitively and ignoring trailing spaces, so a hand-typed "
    "“WEST” and “West ” count as the same zone.")

d.h2("2.4  State")
d.p("The state (REGIO) comes from the selling UNIT's own plant master, with its name taken from "
    "the standard state text table in English. Where the Unit has no state of its own — or no "
    "sales office is recorded on the sale at all — the BILLING plant's state is used instead. It "
    "drives the India choropleth and the Top-states roll-up.")
d.callout("Why the Unit first, and not the billing plant", "The state used to be read from the "
          "billing plant while the zone, the Unit and its map dot all came from the sales office. "
          "The two disagree whenever goods are billed by one plant and sold through another Unit. "
          "Measured in production: the East zone was drawing on 38 billing plants across 14 "
          "states for its 5 Units, so the map shaded Uttar Pradesh and Karnataka as East and "
          "filtering to East coloured half the country. Taking the Unit's state first makes "
          "shading, dots and zone tell one story.")
d.callout("Why the billing plant is still the fallback", "The sales office only came into use in "
          "FY 2026, so most FY 2025 records do not carry one. Had the Unit's state been used on "
          "its own, those records would have lost their state entirely and vanished from the map, "
          "taking every prior-year state comparison with them. They stay exactly where they have "
          "always been — at their billing plant — while records that do carry a sales office get "
          "the corrected attribution.")

d.h2("2.5  Unit")
d.p("A Unit is ALIMCO's grouping of plants under a sales office — 18 of them in production. "
    "Units are what the map's dot overlay plots: one dot per Unit, sized by that Unit's gross "
    "value, positioned at a value-weighted centre of its member plants' coordinates, and "
    "labelled with the Unit code, the Unit name and the value.")
d.callout("The Unit name is the Remarks field", "A Unit's descriptive name is the Remarks column "
          "of the plant/zone mapping table. That table holds one row per Unit, so Remarks is the "
          "Unit's own name rather than a per-plant value. If it is left blank, the map callout "
          "shows the Unit code alone.")

d.h2("2.6  Scheme (Category)")
d.p("A scheme is the business programme a sale belongs to — for example ADIP or ADIP SSA. "
    "In SAP it is the category field on the sales data. The Scheme panel ranks schemes by net "
    "value and shows each one's share of the total and its growth against last year; the Scheme "
    "filter narrows the rest of the screen.")

d.h2("2.7  Fiscal Year and Period")
d.p("Every figure is scoped to exactly one fiscal year, running April 1 to March 31. The "
    "dashboard opens on the fiscal year containing today's date and offers the three most recent "
    "years. The Period filter narrows within that year and is numbered the way the business "
    "counts it — Apr is period 1 and Mar is period 12.")
d.callout("Fiscal year numbering", "A fiscal year is named after the calendar year it STARTS in. "
          "April 2026 to March 2027 is fiscal year 2026, shown as “FY 2026-27”. This "
          "matches SAP's own GJAHR on the billing data.")

# ============================================================== 3 ============
d.h1("3.  Data Sources")
d.p("The dashboard reads from two SAP data providers. Neither is maintained by the dashboard "
    "itself — both are fed by billing processes that already exist.")

d.h2("3.1  Sales at G/L Grain")
d.p("The primary source. One row per G/L account line of a billing document, carrying the net "
    "value, tax and gross, enriched with the plant's state, its zone, its Unit and the Unit's "
    "coordinates. It feeds the KPI cards, the monthly trend behind the sparklines, the India map, "
    "the Scheme panel and the Sales-by-plant panel.")
d.table(["Source", "Contribution"], [
    ["ZSD_SALE_ALL", "The billing lines: net value, tax, gross, posting date, billing type, scheme (category) and its description, customer, plant and sales office."],
    ["ZSD_ZONE_PLANT", "Zone, Unit, Unit name (Remarks) and the Unit's latitude/longitude. Joined on the sales office, and joined LEFT so a plant with no mapping row still contributes its sales."],
    ["T001W", "Plant master — supplies the plant's region (state) code."],
    ["T005U", "Standard state text, English, for India."],
])
d.callout("Missing mapping row", "Because the zone mapping is joined LEFT, a plant that is absent "
          "from it still contributes its sales to every KPI — but it carries no zone, no "
          "Unit and no coordinates, so it silently disappears from the Zone filter, from the Unit "
          "dot overlay, and from any zone-granularity view of the map. Totals stay right; the "
          "breakdowns quietly under-report.")

d.h2("3.2  Materials at Item Grain")
d.p("A second, independent extraction: one row per billing item, carrying the material, its "
    "description, the billed quantity, the sales unit, the item net value and the old material "
    "number. It feeds the Sales-by-material panel and the Material filter list, and nothing else.")
d.table(["Source", "Contribution"], [
    ["VBRP", "Billing items — material, description as billed, quantity, sales unit, item net value, plant."],
    ["VBRK", "Billing header — billing type (used to exclude credit memos), billing date and fiscal year."],
    ["MARA", "Material master — material group and the old material number."],
    ["PRCD_ELEMENTS", "Pricing conditions — the per-item IGST, SGST/CGST and TCS split, and the G/L account each condition posts to."],
])

d.h2("3.3  Why the Two Are Kept Apart")
d.p("The G/L-grain sales data carries no material and no quantity, and its grain is one row per "
    "G/L account line rather than one row per billing document. Joining the billing items onto it "
    "would multiply every row and double-count every net, tax and gross figure on the screen. The "
    "two facts are therefore extracted separately and never joined.")
d.callout("The one place they meet", "When — and only when — a Material filter is "
          "active, the dashboard has to work out which G/L lines belong to that material so the "
          "KPI cards, the map, the Scheme panel and the plant ranking can respect the filter too. "
          "It does that through the G/L account recorded on each pricing condition. Section 7 "
          "explains what happens when that link cannot be established.")

# ============================================================== 4 ============
d.h1("4.  KPI Definitions")
d.p("Four KPI cards sit above the panels. All four respect every active filter. The three money "
    "cards carry a growth pill comparing them against the previous fiscal year; the "
    "single-day card does not, and in FY 2026 the pills are hidden whenever a filter beyond "
    "Fiscal Year is set — both explained in 4.2.")

d.h2("4.1  KPI Summary")
d.table(["KPI", "Definition", "Sub-line beneath the value"], [
    ["Total net value", "Sum of net value across every G/L line in scope", "The same amount, unabbreviated"],
    ["Total tax (GST)", "Sum of tax across every G/L line in scope", "The effective GST rate — tax divided by net, on the same selection"],
    ["Total gross value", "Net value plus tax", "The same amount, unabbreviated"],
    ["Yesterday Sale / Month-End Sale", "Gross value billed on one single day (see 4.3). No growth pill — see 4.2", "That day's date and the invoice count, then the net and tax behind the gross"],
])
d.callout("Gross is derived, not read", "Gross is computed as net + tax rather than taken from a "
          "gross column, so the three money cards always reconcile with each other exactly.")

d.h2("4.2  The Growth Pill, and When It Is Hidden")
d.p("A card with a pill compares itself against the same measure in the previous fiscal year and "
    "shows the movement as a signed percentage. Movement below 0.05% in either direction is "
    "treated as flat. Where there is no prior-year figure at all to divide by, the card shows "
    "“new” instead of a percentage.")
d.p("Two cases carry no pill at all.")
d.callout("The single-day card never shows one", "Yesterday Sale / Month-End Sale reports one "
          "day against the same day a year earlier. A public holiday on one side of that "
          "comparison swings the percentage completely, so it measures the calendar rather than "
          "the business. It was removed outright rather than conditioned.")
d.callout("In FY 2026, filtering hides every pill", "The sales-office grouping behind the Zone "
          "and Unit views only came into use in FY 2026. Most FY 2025 records do not carry one, "
          "so a filtered comparison measures a nearly complete year against a nearly empty one "
          "and reports growth in the thousands of percent. Rather than show a figure that cannot "
          "be trusted, the pills are hidden whenever FY 2026 is selected together with any of "
          "Zone, State, Plant, Scheme, Material or Period.")
d.p("Fiscal Year on its own is deliberately not treated as such a filter. With nothing narrowing "
    "the view, both years total everything they hold, including the records with no sales office, "
    "so the comparison is sound and the pills stay. From FY 2027 the rule lapses by itself, "
    "because FY 2027 is compared against FY 2026, which carries the sales office throughout.")

d.h2("4.3  Yesterday Sale vs Month-End Sale")
d.p("The fourth card reports a single day, and which day it reports on — and therefore what "
    "it is called — depends on what has been filtered:")
d.table(["Selection", "Day reported", "Card title"], [
    ["Current fiscal year, no Period filter", "Yesterday", "Yesterday Sale"],
    ["Current fiscal year, the current period selected on its own", "Yesterday", "Yesterday Sale"],
    ["Any other single or multiple period", "Last day of the latest period selected", "Month-End Sale"],
    ["A past fiscal year, no Period filter", "March 31 of that year", "Month-End Sale"],
])
d.p("This card compares against the same calendar day one year earlier. If the day it would "
    "report on has not happened yet — a future period in a still-open year — the card "
    "shows no billing rather than a misleading zero-versus-last-year drop.")

d.h2("4.4  How Last Year Is Compared")
d.p("This is a deliberate functional decision, and it explains a comparison that would otherwise "
    "look wrong halfway through a year.")
d.p("When the CURRENT fiscal year is selected, the prior year is truncated to the same point in "
    "its own year that today occupies in this one — the same period and the same day of the "
    "month. Five months into a year, five months of this year are compared against the first five "
    "months of last year, not against last year's full twelve.")
d.p("When a PAST, already-closed fiscal year is selected, there is nothing in progress to "
    "truncate, so the two years are compared in full.")
d.callout("Why it matters", "Without this rule, every growth pill on the screen would read "
          "catastrophically negative from April until the following March, simply because a "
          "part-year was being compared against a whole one.")

# ============================================================== 5 ============
d.h1("5.  Screen Content")

d.h2("5.1  Filters")
d.table(["Filter", "Type", "Effect"], [
    ["Fiscal Year", "Single choice, cannot be cleared", "Scopes every KPI and every panel. Defaults to the fiscal year containing today."],
    ["Zone", "Any number of values", "Narrows every panel to the selected zones."],
    ["State", "Any number of values", "Narrows every panel to the selected states."],
    ["Plant", "Any number of values", "Narrows every panel, including the material panel."],
    ["Scheme", "Any number of values", "Narrows the KPI cards, map, scheme panel and plant panel. Does NOT narrow the material panel — see 7."],
    ["Material", "Any number of values", "Narrows the material panel exactly, and the remaining panels as closely as the data allows — see 7."],
    ["Period", "Any number of values, Apr–Mar", "Narrows every panel to the selected months of the fiscal year."],
])
d.p("Every multi-value filter offers a Select all option, shows the code beside the description, "
    "and can be left empty to mean “everything”.")

d.h2("5.2  The Go Button")
d.p("Changing a filter does NOT reload the dashboard. Selections are staged, and the screen keeps "
    "showing the last result until Go is pressed. While changes are staged the Go button is "
    "highlighted, so the button itself tells the user a refresh is pending.")
d.p("Two things behave differently: the dashboard loads the current fiscal year automatically "
    "when it is first opened, and Reset clears everything and reloads at once, because clearing "
    "is an explicit action rather than an edit in progress.")
d.callout("Clicking the map is also a filter edit", "Clicking a state, a zone, a scheme row or a "
          "Top-states row adds or removes that value in the corresponding filter — and, like "
          "any other filter edit, waits for Go. Clicking the same value a second time removes it "
          "again rather than replacing the whole selection.")

d.h2("5.3  Sales Across India")
d.p("An India map with two independent layers.")
d.h3("The choropleth")
d.p("Each state is shaded by its gross value, and the panel can be switched between State and Zone "
    "granularity. In Zone granularity a zone is drawn as one continuous region made of its member "
    "states, so it reads as a single area rather than as several states that happen to share a "
    "colour. The colour scale is a quantile scale — equal COUNTS of states per colour "
    "step, not equal value ranges — so a handful of very large states cannot wash the whole "
    "map into a single colour. The legend is labelled with the real value at each break, and "
    "closes with the actual largest value on the map. States with no billing at all get their own "
    "separate swatch rather than the palest colour.")
d.callout("The scale follows the layer, not the dots", "In State mode the scale describes states; "
          "in Zone mode it describes zones. Neither describes the Unit dots, which are a different "
          "series entirely — so a Unit dot worth more than the scale's top break is normal, "
          "not an error.")
d.h3("The Unit dots")
d.p("An overlay that can be switched off. One dot per Unit, its size proportional to that Unit's "
    "gross value, joined by a leader line to a label carrying the Unit code, the Unit name and the "
    "value. Labels are laid out in the margins on either side of the map and nudged apart so that "
    "no two leader lines collide. Hovering a state, a zone or a dot opens a card showing three "
    "figures and nothing else: the gross billed value, and the net and tax that make it up. It "
    "carried growth, share of India, plants-billing and invoice counts until 2026-08-18, when "
    "they were removed to keep the card readable.")
d.callout("A dot sits where the Unit is, not where its zone is", "Dot positions come from the "
          "latitude and longitude maintained against the Unit. 2000 HQ is drawn at Kanpur because "
          "that is where it is, even though it belongs to the Central zone. Position is geography; "
          "colour is the business zoning. They are allowed to differ.")

d.h2("5.4  Scheme Performance")
d.p("A ranked list rather than a chart. Each scheme shows a colour chip, its gross value, a "
    "progress bar of its share, the share percentage, the invoice count and its growth against "
    "last year. Hovering a row shows the net and tax behind that gross. Beneath a divider sits "
    "the Top-states roll-up. Every row is clickable and toggles that scheme — or that state "
    "— in the filter bar. Schemes with no gross value in the current selection are not "
    "listed.")

d.h2("5.5  Sales by Plant")
d.p("The top 20 plants by net value, drawn as stacked bars of net plus tax, so the full bar is "
    "the gross. The plant's city is shown beside its code.")
d.callout("Top 20 is the chart, not the filter", "The panel is capped at 20 plants, but the Plant "
          "filter is not — it lists every plant that billed anything in the current scope, "
          "which in production is far more than twenty. The same applies to materials.")

d.h2("5.6  Sales by Material")
d.p("The top 20 materials by gross value. Each material carries its billed description, its old "
    "material number, its quantity and sales unit, and its GST split into IGST, SGST, CGST and "
    "TCS. Percentage-of-total is calculated against every material in scope, not just the twenty "
    "shown, so the listed shares correctly add up to less than 100%.")
d.callout("Credit memos", "Credit memos are excluded from the material panel, so it reports "
          "invoiced material value only. The KPI cards and the other panels do not apply this "
          "exclusion — a difference worth knowing when reconciling the two.")

# ============================================================== 6 ============
d.h1("6.  Configuration Responsibilities")
d.p("The dashboard is configuration-driven. Nothing on the screen can be corrected from the UI "
    "— every fix is a change to one of the following.")

d.h2("6.1  ZSD_ZONE_PLANT — Zone, Unit and Coordinates")
d.p("The single most important table for this dashboard. Despite its name, its WERKS column holds "
    "one row per UNIT, not per billing plant, and it is joined to the sales data on the sales "
    "office. It supplies four things at once:")
d.bullets([
    "ALM_ZONE — the zone the Unit belongs to.",
    "WERKS — the Unit code itself, which the map dots are grouped on.",
    "REMARKS — the Unit's descriptive name, shown on the map callouts and hover card.",
    "LATITUDE / LONGITUDE — where the Unit's dot is drawn.",
])
d.callout("No coordinates, no dot", "A Unit whose plants carry no latitude and longitude is left "
          "off the map entirely rather than plotted at a meaningless point off the coast of "
          "Africa. Its sales still count in every other panel. If a Unit is missing from the "
          "overlay, its coordinates are the first thing to check.")

d.h2("6.2  Unit Master Region")
d.p("The state a sale is attributed to comes from the selling Unit's own plant master region, "
    "falling back to the billing plant's where the Unit has none. A sale can therefore only lose "
    "its state if BOTH are blank; it then contributes to the KPI cards and the plant ranking but "
    "cannot be placed on the map or counted in any state total.")
d.callout("A Unit missing from ZSD_ZONE_PLANT loses its zone, not its state", "Zone, Unit, city "
          "and dot position are all read through the Unit's mapping row, so a sales office with "
          "no row there has none of them — no dot, no zone, and no place in a zone-filtered view. "
          "Its STATE survives, because the billing plant supplies it. Its value counts in every "
          "KPI and in the plant ranking either way. Keeping ZSD_ZONE_PLANT complete is what "
          "prevents the gap; ZSD_PMS_ZONE_DIAG reports which sales offices are missing.")

d.h2("6.3  Pricing Condition Types")
d.p("The material panel's GST split, and the material filter's effect on the rest of the screen, "
    "both depend on a fixed list of pricing condition types — IGST, SGST, and the three TCS "
    "conditions — plus the G/L account each of them posts to. A condition type used by "
    "ALIMCO but absent from that list is invisible to the dashboard.")
d.callout("The failure is silent", "If the configured condition types do not match, the GST "
          "columns simply read zero rather than raising an error, and the material filter falls "
          "back to a coarser document-level match. Reconcile the GST split against a sales "
          "register report before trusting it.")

d.h2("6.4  Configuration Checklist")
d.table(["#", "Check", "When"], [
    ["1", "Every selling Unit exists in ZSD_ZONE_PLANT with ALM_ZONE and REMARKS maintained", "On Unit creation, and at year end"],
    ["2", "Every Unit in ZSD_ZONE_PLANT carries a latitude and longitude", "On Unit creation, and whenever a dot is missing from the map"],
    ["3", "Every Unit in ZSD_ZONE_PLANT has a region maintained in its own plant master", "On Unit creation"],
    ["4", "Zone codes match the expected set (North, West, South, East, Central)", "When a new zone is introduced"],
    ["5", "The pricing condition types used for GST and TCS match the list the dashboard reads", "After any pricing procedure change"],
    ["6", "The OData service ZSD_PMS_DASH_O4 is published and all nine entity sets respond", "After transport to a new system"],
])

# ============================================================== 7 ============
d.h1("7.  Known Functional Limitations")
d.p("The limitations below follow directly from the two-grain design in section 3, and both are "
    "visible to users. Neither is a defect — both are documented consequences of not "
    "double-counting.")

d.h2("7.1  Zone, State, Scheme and Period Reach the Material Panel Indirectly")
d.p("None of these four exists on the billing items — they live only on the G/L-grain sales "
    "data. The material panel honours them by keeping only those items whose billing document "
    "survived the same filters on the G/L side. This is exact for zone, state and period, which "
    "are properties of the document as a whole, and exact for scheme in the normal case of one "
    "scheme per document.")
d.callout("What this fixed", "Filtering to a zone used to leave the material panel showing every "
          "material in the country, because the filter could not reach it at all. Selecting a zone "
          "in which a material never sold now correctly reports no material for the current "
          "selection.")

d.h2("7.2  The Material Filter Is Exact on Materials, Approximate Elsewhere")
d.p("The material panel filters exactly. For the other panels, the dashboard has to translate a "
    "material into G/L lines, which it does through the G/L account recorded on each pricing "
    "condition. Where that translation succeeds, the filter is exact. Where it does not — a "
    "fully tax-exempt line, or a plant on a differently configured pricing procedure — the "
    "dashboard falls back to including the whole billing document.")
d.callout("Which way it errs", "The fallback OVER-states rather than under-states: a "
          "multi-material invoice contributes all of its lines rather than just the filtered "
          "material's. This was a deliberate choice — an earlier version dropped those "
          "documents instead, which blanked every KPI card and every panel except the material "
          "one the moment a material was picked.")

# ============================================================== 8 ============
d.h1("8.  Behaviour in Exceptional Situations")
d.table(["Situation", "What the dashboard does"], [
    ["A filter combination returns no sales", "Each affected panel shows its own “no data” message rather than an empty canvas. This is not an error."],
    ["A Unit has no coordinates maintained", "Its dot is omitted from the map overlay. Its sales still count in every other panel."],
    ["A plant is missing from the zone mapping", "Its sales still count in the KPI cards and plant panel, but it carries no zone or Unit, so it is absent from the Unit dots and from zone-granularity views."],
    ["A state has no billing at all", "It is painted in the map's separate “no billing” colour, not in the palest step of the value scale."],
    ["There is no prior-year figure to compare against", "The growth pill reads “new” instead of a percentage."],
    ["The reference day for the daily KPI is in the future", "The card reports no billing rather than a zero that looks like a collapse."],
    ["The Plant or Material filter list cannot be loaded", "The rest of the dashboard loads normally and those two filters fall back to listing only the codes the Top-20 panels returned."],
    ["A core entity fails to load", "An error strip names which one failed and gives the backend's own message; every panel is cleared rather than left showing stale figures."],
    ["Filters have been changed but Go has not been pressed", "The screen keeps showing the previous result and the Go button is highlighted to indicate a pending refresh."],
])

# ============================================================== 9 ============
d.h1("9.  Frequently Asked Questions")

faq = [
    ("Why does the material panel's total not match the Total net value card?",
     "Three reasons, in order of likelihood. First, a Scheme filter is set — it does not "
     "narrow the material panel (see 7.1). Second, the material panel excludes credit memos and "
     "the KPI cards do not. Third, the panel shows only the top 20 materials, while the card "
     "totals everything in scope."),
    ("A Unit is missing from the map. Where did it go?",
     "It has no latitude and longitude maintained in the plant/zone mapping. Units with no "
     "coordinates are deliberately left off rather than plotted at an arbitrary point. Its sales "
     "are still counted everywhere else on the screen."),
    ("The map's colour scale tops out well below one of the dot values. Is the scale wrong?",
     "No. The scale describes the shaded layer — states, or zones — and the dots are a "
     "different series measured at Unit level. A single Unit can easily be worth more than any "
     "one state."),
    ("I changed a filter and nothing happened.",
     "That is intended. Filter changes are staged so that a scoping session does not trigger a "
     "full reload on every click. Press Go to apply them; the Go button is highlighted while "
     "changes are pending."),
    ("Growth looks impossibly good, or impossibly bad, on a scheme or a state.",
     "Check the prior year first. Where last year's figure is very small, a modest absolute "
     "movement produces an enormous percentage. Where last year's figure is zero, the pill shows "
     "“new” rather than a percentage at all. In FY 2026 the known case of this — a "
     "filtered view whose prior year has no sales office — is handled by hiding the pills "
     "outright; see 4.2."),
    ("The growth pills disappeared when I applied a filter.",
     "That is intended, and only happens in FY 2026. The comparison against FY 2025 is not "
     "reliable once the view is narrowed, because the sales-office grouping did not exist last "
     "year — see 4.2 for the full reason. Clear the filters, or select a different fiscal year, "
     "and they return. The figures themselves are unaffected; only the comparison is withheld."),
    ("Why is a state coloured when I have filtered to a different zone?",
     "It should not be. The dashboard re-checks each state's zone itself before painting the map, "
     "precisely to prevent this. If it still happens, the state-to-zone rule needs a state added "
     "or corrected — report which state and which zone."),
    ("The GST columns on the material panel are all zero.",
     "The pricing condition types the dashboard reads do not match the ones ALIMCO's pricing "
     "procedure actually uses. This fails silently by design rather than blocking the panel. It "
     "is a configuration check, not a data problem."),
    ("Can I export this to Excel?",
     "Not from this screen. The dashboard is a visual summary; for line-item detail use the "
     "standard sales register report."),
    ("Can I pick an arbitrary date range?",
     "No. The fiscal year always spans April 1 to March 31. Use the Period filter to narrow to "
     "particular months within it."),
    ("Why does the plant panel show only 20 plants when the Plant filter lists many more?",
     "The panel is deliberately capped at the top 20 by value so it stays readable. The filter is "
     "deliberately not capped, so that any plant that billed can be selected."),
]
for q, a in faq:
    d.h3(q)
    d.p(a)

d.save(sys.argv[1])
print("FS written")
