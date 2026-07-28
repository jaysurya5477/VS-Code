# GRN Dashboard — Implementation Plan

---

## 1. Filters

| # | Filter | Type | Notes |
|---|--------|------|-------|
| 1 | **Vendor** | Multi-select dropdown | Cascading with Material & Plant |
| 2 | **Material** | Multi-select dropdown | Cascading with Vendor & Plant |
| 3 | **Plant** | Multi-select dropdown | Cascading with Vendor & Material |
| 4 | **PO Doc. Type** | Multi-select dropdown | Exclude STO Doc. Types at data source level |
| 5 | **GRN Year** | Single-select / Range | Default: Current Year |
| 6 | **GRN Month** | Multi-select dropdown | Default: All Months |
| 7 | **GRN Date** | Date picker (single or range) | Overrides Year/Month when used |

> **UX Note:** Apply cascading logic so selecting a Plant narrows Vendor and Material lists. Default the dashboard to "Current Year" on first load.

---

## 2. Graph Sum Values (KPIs & Metrics)

| # | Metric | Movement Types | Formula / Logic |
|---|--------|----------------|-----------------|
| 1 | **GRN Qty** | 101, 102 | Sum of all GRN quantities (102 shown as negative) |
| 2 | **GRN Value** | All | Sum of all GRN values (reversals shown as negative) |
| 3 | **Quality Accepted** | 101 | Sum of quantities where quality status = Accepted |
| 4 | **Quality Rejected** | 101, 102 | Sum of quantities where quality status = Rejected |
| 5 | **Quality Sample** | 101 | Sum of quantities where quality status = Sample / Under Inspection |
| 6 | **Rework GRN Qty** | Z22, Z23 | Sum of rework-related quantities (Z23 shown as negative) |
| 7 | **GRN Qty − Rework GRN Qty** | — | Net effective receipt quantity |
| 8 | **GRN Value − Rework GRN Value** | — | Net effective receipt value |

---

## 3. Conditions

| # | Condition | Implementation Detail |
|---|-----------|----------------------|
| 1 | **Exclude STO Doc. Types** | Apply filter at the data extraction / SQL WHERE clause level before aggregation. Document this exclusion in dashboard subtitle and footer. |
| 2 | **102, Z23 — Negative Values** | Display 102 and Z23 quantities/values as negative numbers in all charts, tables, and KPIs. Use red color coding for negative values. Ensure net calculations use signed arithmetic. |

---

## 4. Calculated Ratios (Recommended)

| Ratio | Formula | Purpose |
|-------|---------|---------|
| **Rejection Rate %** | `Rejected Qty / (Accepted + Rejected + Sample) × 100` | Quality health at a glance |
| **Rework Rate %** | `Rework GRN Qty / GRN Qty × 100` | Rework impact on total flow |
| **Net GRN Rate** | `(GRN Qty − Rework Qty) / GRN Qty` | Efficiency of clean receipts |
| **Avg. GRN Value per Unit** | `GRN Value / GRN Qty` | Price variance tracking |
| **Vendor Quality Score** | Weighted score of acceptance vs. rejection | Vendor comparison ranking |

---

## 5. Dashboard Layout — Section Structure

### Section A: Executive Summary (Top Row)
- **8 KPI Cards** displaying all sum values
- Each card shows:
  - Metric label
  - Current period value
  - vs. last period change % (with up/down arrow)
  - Color-coded left border