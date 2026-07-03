# CV Ageing Dashboard - CDS & AMDP Implementation Guide

## Overview
This document describes the CDS (Core Data Services) and AMDP (Analytical Managed Data Provider) implementation for Customer/Vendor Ageing Dashboard.

**Target System:** S/4HANA 2020 or higher  
**Technology Stack:** CDS Views (DDLS) + SQLScript AMDP + OData V4  
**Data Source:** ACDOCA (Universal Journal), BSID/BSAD, BSIK/BSAK  
**Purpose:** Real-time aging analysis for Fiori dashboard  

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Fiori Dashboard (UI5 + ApexCharts / Chart.js)          │
│ HTTP GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet│
└──────────────────────┬──────────────────────────────────┘
                       │ OData V4 JSON Response
┌──────────────────────▼──────────────────────────────────┐
│ Gateway / OData Service (ZCV_AGEING_SRV)               │
│ Exposes: Q_CV_AGEING_OD (Query View)                    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ CDS View Layer (DDLS)                                   │
│                                                          │
│ I_CV_AGEING_MASTER (Interface)                         │
│   ├─ Reads ACDOCA, KNA1, LFA1, SKAT                    │
│   ├─ Calculates DaysOld                                │
│   └─ Determines Status (Advance/Normal)                │
│                                                          │
│ I_CV_BUCKET_CONFIG (Interface)                         │
│   ├─ Reads ZFI_CV_BUCKET table                         │
│   └─ Calculates DaysFromValue, DaysToValue             │
│                                                          │
│ CF_CV_AGEING (Calculation View)                        │
│   ├─ Joins master + bucket config                      │
│   ├─ Matches documents to buckets                      │
│   └─ Aggregates by group keys                          │
│                                                          │
│ Q_CV_AGEING_OD (Query View)                            │
│   ├─ OData-friendly output                             │
│   └─ Adds UI metadata annotations                      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ AMDP Procedure (SQLScript)                              │
│ ZCL_CV_AGEING_AMDP.calculate_ageing_data               │
│                                                          │
│ Purpose:                                                 │
│   1. Read documents from ACDOCA                        │
│   2. Calculate DaysOld per document                    │
│   3. Match to bucket based on duration_type           │
│   4. Aggregate by Customer/Vendor, PCenter, Account   │
│   5. Return normalized format                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ Database Layer (HANA)                                   │
│                                                          │
│ ACDOCA (Universal Journal)                             │
│ BSID/BSAD (Customer Invoices)                          │
│ BSIK/BSAK (Vendor Invoices)                            │
│ KNA1 (Customers)                                        │
│ LFA1 (Vendors)                                          │
│ SKAT (GL Accounts)                                      │
│ ZFI_CV_BUCKET (Ageing Bucket Config)                   │
└─────────────────────────────────────────────────────────┘
```

---

## CDS Views Detail

### 1. I_CV_AGEING_MASTER (Interface View)
**File:** `I_CV_AGEING_MASTER.ddls`  
**SQL View Name:** ICV_AGE_MASTER  
**Purpose:** Master data for aging calculation

#### Key Fields:
- **Ledger, CompanyCode, FiscalYear, DocumentNumber, DocumentLineItem**
- **ProfitCenter, GLAccount** — Grouping dimensions
- **CustomerID, CustomerName, VendorID, VendorName** — Party information
- **PostingDate** — Used to calculate DaysOld
- **Amount (HSL)** — Value to aggregate
- **SpecialGLIndicator** — Used to determine Status
- **Status (Advance/Normal)** — Derived from SpecialGLIndicator
- **DaysOld** — Calculated as `DATEDIFF(current_date, posting_date) + 1`

#### Key Calculations:
```abap
Status = CASE WHEN umskz <> ' ' THEN 'Advance' ELSE 'Normal' END

DaysOld = DATEDIFF(DAY, budat, TODAY()) + 1
```

#### SQL:
```sql
FROM ACDOCA a
LEFT JOIN KNA1 ON a.kunnr = kna.kunnr
LEFT JOIN LFA1 ON a.lifnr = lfa.lifnr
LEFT JOIN SKAT ON skat.saknr = a.racct AND skat.spras = 'E'
WHERE a.rldnr = '00'  -- Actual ledger only
```

---

### 2. I_CV_BUCKET_CONFIG (Interface View)
**File:** `I_CV_BUCKET_CONFIG.ddls`  
**SQL View Name:** ICV_BUCKET_CFG  
**Purpose:** Bucket configuration with day range conversion

#### Key Fields:
- **Variant** — Bucket set identifier
- **SequenceNumber** — Display order
- **FromValue, ToValue** — Raw bucket range (in days or years)
- **DurationType** — D, Y, D+, Y+
- **BucketKey** — Column identifier (e.g., 0TO30DAYS)
- **BucketLabel** — Display label (e.g., "0 to 30 Days")

#### Calculated Fields:
```sql
-- Convert to day-based range for matching
DaysFromValue = CASE
  WHEN DurationType = 'D'  THEN FromValue
  WHEN DurationType = 'D+' THEN FromValue
  WHEN DurationType = 'Y'  THEN FromValue * 365
  WHEN DurationType = 'Y+' THEN FromValue * 365
  ELSE 0
END

DaysToValue = CASE
  WHEN DurationType = 'D'  THEN ToValue
  WHEN DurationType = 'D+' THEN 999999999
  WHEN DurationType = 'Y'  THEN ToValue * 365
  WHEN DurationType = 'Y+' THEN 999999999
  ELSE 0
END
```

#### Example Data:
```
Variant | SNO | FromValue | ToValue | DurationType | BucketKey   | BucketLabel
--------|-----|-----------|---------|--------------|-------------|-------------------
001     | 10  | 0         | 30      | D            | 0TO30DAYS   | 0 to 30 Days
001     | 20  | 31        | 60      | D            | 31TO60DAYS  | 31 to 60 Days
001     | 30  | 61        | 90      | D            | 61TO90DAYS  | 61 to 90 Days
001     | 40  | 91        | NULL    | D+           | 90PLUS      | 90+ Days
002     | 10  | 1         | 1       | Y            | 1YEAR       | 1 Year Old
002     | 20  | 2         | NULL    | Y+           | 2PLUS       | 2+ Years Old
```

---

### 3. CF_CV_AGEING (Calculation View)
**File:** `CF_CV_AGEING.ddls`  
**SQL View Name:** CCV_AGEING  
**Purpose:** Aggregate aging data by bucket

#### Grouping Keys:
- CompanyCode
- CustomerID / VendorID
- ProfitCenter
- GLAccount
- Status (Advance/Normal)
- **BucketKey** (most important for dashboard)

#### Aggregations:
```sql
SUM(Amount) AS AgingAmount
MAX(DaysOld) AS MaxDaysOld
MIN(DaysOld) AS MinDaysOld
```

#### Bucket Matching Logic:
```sql
WHERE
  master.DaysOld >= bucket.DaysFromValue
  AND master.DaysOld <= bucket.DaysToValue
```

---

### 4. Q_CV_AGEING_OD (Query View)
**File:** `Q_CV_AGEING_OD.ddls`  
**SQL View Name:** QCV_AGEING_OD  
**Purpose:** OData-friendly output layer

#### Features:
- `@OData.publish: true` — Exposes to OData protocol
- `@UI.identification` — Defines field visibility and order
- `@Semantics.amount.currencyCode` — Currency metadata
- `@Search.searchable` — Enables search on key fields
- Currency field hardcoded to 'USD' (can be made dynamic)

#### Output Fields:
```
CompanyCode (hidden)
CustomerID / CustomerName (searchable)
VendorID / VendorName (searchable)
ProfitCenter
GLAccount / AccountDescription
Status
BucketKey / BucketLabel (searchable)
AgingAmount (currency)
TotalPerGroup (currency)
DurationType (hidden)
MinDaysOld / MaxDaysOld (hidden)
Currency
```

---

## AMDP Implementation

### ZCL_CV_AGEING_AMDP Class
**File:** `ZCL_CV_AGEING_AMDP.abap`  
**Language:** SQLScript (embedded in ABAP)  
**Interface:** `IF_AMDP_MARKER_HDB`

### Method: calculate_ageing_data

#### Input Parameters:
```abap
iv_variant     TYPE char4      -- Bucket variant (e.g., '001')
iv_company     TYPE char4      -- Company code (e.g., '1000')
iv_cutoff_date TYPE dats       -- Reference date (e.g., sy-datum)
```

#### Output Parameters:
```abap
et_result TYPE TABLE OF zgfi_cv_ageing_result
```

#### Result Table Structure:
```abap
TYPES: BEGIN OF zgfi_cv_ageing_result,
  company_code        TYPE char4,
  customer_id         TYPE char10,
  customer_name       TYPE char50,
  vendor_id           TYPE char10,
  vendor_name         TYPE char50,
  profit_center       TYPE char10,
  gl_account          TYPE char10,
  account_text        TYPE char50,
  status              TYPE varchar(10),
  bucket_key          TYPE varchar(30),
  bucket_label        TYPE nvarchar(60),
  duration_type       TYPE char2,
  aging_amount        TYPE decimal(15,2),
  total_per_group     TYPE decimal(15,2),
  min_days_old        TYPE int,
  max_days_old        TYPE int,
END OF zgfi_cv_ageing_result.
```

### Algorithm

#### Step 1: Read Master Data
```sql
SELECT FROM acdoca a
  LEFT JOIN kna1 ON a.kunnr = kna.kunnr
  LEFT JOIN lfa1 ON a.lifnr = lfa.lifnr
  LEFT JOIN skat ON skat.saknr = a.racct
WHERE
  a.rldnr = '00'
  AND a.rbukrs = :iv_company
  AND a.budat <= :iv_cutoff_date
```

**Calculates per document:**
```
days_old = DAYS_BETWEEN(posting_date, iv_cutoff_date) + 1
status = CASE WHEN umskz <> ' ' THEN 'Advance' ELSE 'Normal' END
```

#### Step 2: Read Bucket Configuration
```sql
SELECT FROM zfi_cv_bucket
WHERE variant = :iv_variant
ORDER BY sno
```

#### Step 3: Match Documents to Buckets
**For each document:**
  1. Read `days_old`
  2. Loop through buckets (ordered by sequence)
  3. Apply CASE logic based on `duration_type`:
     - **D**: `IF days_old BETWEEN from_sel AND to_sel THEN match`
     - **Y**: `IF (days_old/365.25) BETWEEN from_sel AND to_sel THEN match`
     - **D+**: `IF days_old >= from_sel THEN match`
     - **Y+**: `IF (days_old/365.25) >= from_sel THEN match`
  4. Insert into result table when matched

#### Step 4: Aggregate by Group Keys
```sql
GROUP BY
  company_code, customer_id, customer_name,
  vendor_id, vendor_name, profit_center, gl_account,
  account_text, status, bucket_key, bucket_label, duration_type
```

**Calculations:**
```sql
sum(aging_amount) AS AgingAmount

-- Total per group: SUM of all buckets for same [Customer, PCenter, Account, Status]
SUM(SUM(aging_amount)) OVER (
  PARTITION BY company_code, customer_id, vendor_id, 
              profit_center, gl_account, status
) AS TotalPerGroup
```

#### Step 5: Return Sorted Result
```sql
ORDER BY customer_id, vendor_id, profit_center, gl_account, bucket_key
```

---

## OData Service

### Service: ZCV_AGEING_SRV
**Gateway Project:** SEGW or Fiori Tools  
**Technical Name:** SRV_CV_AGEING  
**Entity Set:** CVAgeingSet (from Q_CV_AGEING_OD)

### Test URLs (Postman / REST Client)

#### 1. All Data
```
GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet
```

#### 2. Customer Aging (Company 1000)
```
GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$filter=CompanyCode eq '1000' and CustomerID ne ''
```

#### 3. Vendor Aging (Company 1000)
```
GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$filter=CompanyCode eq '1000' and VendorID ne ''
```

#### 4. Specific Bucket Range
```
GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$filter=BucketKey eq '0TO30DAYS'
```

#### 5. With Aggregations
```
GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$select=CustomerID,BucketKey,AgingAmount&$orderby=AgingAmount desc
```

### Expected Response (JSON)
```json
{
  "d": {
    "results": [
      {
        "__metadata": {
          "type": "ZCV_AGEING_SRV.CVAgeing",
          "uri": "..."
        },
        "CompanyCode": "1000",
        "CustomerID": "CUST001",
        "CustomerName": "ABC Manufacturing",
        "BucketKey": "0TO30DAYS",
        "BucketLabel": "0 to 30 Days",
        "AgingAmount": "50000.00",
        "TotalPerGroup": "200000.00",
        "Currency": "USD"
      }
    ]
  }
}
```

---

## Deployment Steps

### 1. Create Table (ZFI_CV_BUCKET)
- Use SE11 (Data Dictionary)
- Import from `ZFI_CV_BUCKET_definition.txt`
- Activate table

### 2. Create CDS Views
- Use ADT (ABAP Development Tools) in Eclipse or VS Code
- Create files in package `Z_CV_AGEING`:
  - `I_CV_AGEING_MASTER.ddls`
  - `I_CV_BUCKET_CONFIG.ddls`
  - `CF_CV_AGEING.ddls`
  - `I_CV_AGEING_RESULT.ddls`
  - `Q_CV_AGEING_OD.ddls`
- Activate all CDS views

### 3. Create AMDP Class
- Create ABAP class `ZCL_CV_AGEING_AMDP`
- Activate class

### 4. Create OData Service
- Use Fiori Tools or Gateway (SEGW)
- Create service `ZCV_AGEING_SRV`
- Publish to system

### 5. Test Data
- Insert sample records into `ZFI_CV_BUCKET` table
- Use test transaction to verify ACDOCA data

### 6. Fiori App Integration
- Create SAPUI5 app using OData service
- Implement visualization using ApexCharts or Chart.js
- Deploy as Fiori tile

---

## Performance Considerations

### Indexing (ZFI_CV_BUCKET)
```sql
PRIMARY KEY: Variant, SNO
SECONDARY INDEXES:
  - (Variant, DurationType)
  - (Variant, BucketKey)
```

### ACDOCA Optimization
- Filter by posting date (`budat <= iv_cutoff_date`)
- Use ledger index (`rldnr = '00'`)
- Partition by fiscal year if > 100M rows

### Query Performance
- Cache bucket configuration (changes rarely)
- Use `$top=$skip` pagination in Fiori app
- Consider materialized view if queries exceed 5 sec

### Incremental Refresh
- Add last-modified timestamp to ZFI_CV_BUCKET
- Delta sync in Fiori app for real-time updates

---

## Error Handling

### Common Issues

| Issue | Cause | Resolution |
|-------|-------|-----------|
| No data returned | Wrong variant ID | Verify ZFI_CV_BUCKET has data for variant |
| Negative DaysOld | Future posting date | Check ACDOCA.budat <= cutoff_date |
| Bucket mismatch | Duration type calc error | Review AMDP CASE logic |
| OData timeout | Large dataset | Add filters, use pagination |
| NullPointer in JS | Missing field in OData | Check @UI annotations |

---

## Testing Checklist

- [ ] ZFI_CV_BUCKET contains valid buckets
- [ ] I_CV_AGEING_MASTER returns ACDOCA data
- [ ] I_CV_BUCKET_CONFIG converts days correctly
- [ ] CF_CV_AGEING aggregates by group
- [ ] Q_CV_AGEING_OD is OData-publishable
- [ ] ZCV_AGEING_SRV service is activated
- [ ] Postman test returns JSON with buckets
- [ ] Fiori app displays data correctly
- [ ] Performance < 5 seconds for 100K records
- [ ] All bucket types (D, Y, D+, Y+) working

---

## Support & Maintenance

**Developed:** 2026-06-29  
**Last Updated:** 2026-06-29  
**Contact:** Fiori Development Team  
**Ticket System:** [Jira / SAP Incident Management]

---
