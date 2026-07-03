# CV Ageing Dashboard - Quick Start Guide

## Project Structure

```
CV Ageing Dashboard/
├── Table/
│   └── ZFI_CV_BUCKET_definition.txt    (Bucket configuration table schema)
│
├── CDS/
│   ├── I_CV_AGEING_MASTER.ddls         (Interface: Master data for aging)
│   ├── I_CV_BUCKET_CONFIG.ddls         (Interface: Bucket configuration)
│   ├── CF_CV_AGEING.ddls               (Calculation: Bucket aggregation)
│   ├── I_CV_AGEING_RESULT.ddls         (Interface: Result structure)
│   └── Q_CV_AGEING_OD.ddls             (Query: OData exposure)
│
├── AMDP/
│   └── ZCL_CV_AGEING_AMDP.abap         (SQLScript procedure for aggregation)
│
├── OData/
│   └── ZCV_AGEING_SRV_configuration.txt (Service setup & test URLs)
│
├── Documentation/
│   ├── CDS_AMDP_Implementation_Guide.md (Detailed technical guide)
│   └── README.md                        (This file)
│
└── ZFI_CUST_VEND_AGING_RPT.abap        (Original ABAP report)
```

---

## What This Project Does

**Purpose:** Convert legacy ABAP aging report into modern OData service for Fiori dashboard

**Input:** Customer/Vendor invoices from SAP (ACDOCA, BSID/BSAD, BSIK/BSAK)

**Output:** Normalized aging bucket data in JSON via OData

**Example Output:**
```json
{
  "CompanyCode": "1000",
  "CustomerID": "CUST001",
  "CustomerName": "ABC Ltd",
  "BucketKey": "0TO30DAYS",
  "BucketLabel": "0 to 30 Days",
  "AgingAmount": "50000.00",
  "TotalPerGroup": "200000.00"
}
```

---

## System Requirements

- **SAP System:** S/4HANA 2020 or higher
- **Database:** SAP HANA (for AMDP support)
- **Tools:** ADT (ABAP Development Tools) in Eclipse or VS Code
- **Packages:** Z_CV_AGEING (custom development)

---

## Step 1: Create Database Table (ZFI_CV_BUCKET)

### Using SE11 (Data Dictionary):

1. **Create Table:**
   ```
   Tcode: SE11
   → "Create" button
   → Table Name: ZFI_CV_BUCKET
   ```

2. **Define Fields:**
   ```
   Field Name      | Key | Data Type | Length | Description
   ──────────────────────────────────────────────────────────
   VARIANT         | ✓   | CHAR      | 4      | Bucket variant ID
   SNO             | ✓   | INT4      | -      | Sequence number
   FROM_SEL        |     | INT3      | -      | From value (days/years)
   TO_SEL          |     | INT3      | -      | To value (days/years)
   DURATION_TYPE   | ✓   | CHAR      | 2      | D, Y, D+, Y+
   FROM_TO         |     | CHAR      | 30     | Bucket key
   FROM_TO_DESC    |     | CHAR      | 60     | Bucket label
   CREATED_BY      |     | CHAR      | 12     | User
   CREATED_DATE    |     | DATS      | -      | Date
   ```

3. **Primary Key:** VARIANT + SNO + DURATION_TYPE

4. **Activate:** Ctrl+S → Activate

5. **Insert Sample Data:**
   ```
   VARIANT | SNO | FROM_SEL | TO_SEL | DURATION_TYPE | FROM_TO   | FROM_TO_DESC
   --------|-----|----------|--------|---------------|-----------|-------------------
   001     | 10  | 0        | 30     | D             | 0TO30     | 0 to 30 Days
   001     | 20  | 31       | 60     | D             | 31TO60    | 31 to 60 Days
   001     | 30  | 61       | 90     | D             | 61TO90    | 61 to 90 Days
   001     | 40  | 91       | NULL   | D+            | 90PLUS    | 90+ Days
   ```

---

## Step 2: Deploy CDS Views

### Using ADT in Eclipse/VS Code:

1. **Create Package:**
   ```
   Tcode: SE21
   → New Package: Z_CV_AGEING
   → Description: CV Ageing Fiori Dashboard
   → Activate
   ```

2. **Create CDS Files:**
   - Copy `I_CV_AGEING_MASTER.ddls` → ADT Project
   - Copy `I_CV_BUCKET_CONFIG.ddls` → ADT Project
   - Copy `CF_CV_AGEING.ddls` → ADT Project
   - Copy `I_CV_AGEING_RESULT.ddls` → ADT Project
   - Copy `Q_CV_AGEING_OD.ddls` → ADT Project

3. **Activate Each View:**
   - Right-click file → Activate
   - Verify: No syntax errors

4. **Verify CDS Activation:**
   ```
   Tcode: SE16N
   → Table: DDXFDDLS
   → Filter: NAME like 'ICV*' or 'CCV*' or 'QCV*'
   ```

---

## Step 3: Create AMDP Class

### Using ADT:

1. **Create Class:**
   ```
   Right-click Package → New → Class
   Name: ZCL_CV_AGEING_AMDP
   Description: AMDP Procedure for CV Ageing
   Create
   ```

2. **Copy Code:**
   - Copy `ZCL_CV_AGEING_AMDP.abap` content
   - Paste into class editor

3. **Create Result Type (Optional):**
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

4. **Activate:**
   - Ctrl+S → Activate
   - Check: "Class Activated Successfully"

---

## Step 4: Create OData Service

### Option A: Using Fiori Tools (Recommended)
```
1. Open Command Palette (Ctrl+Shift+P)
2. Search: "Fiori: Create New Application"
3. Select: "List Report Object Page"
4. Data Source: "OData - Already Created"
5. Service URL: /sap/opu/odata/sap/ZCV_AGEING_SRV
6. Main Entity: CVAgeingSet
7. Create
```

### Option B: Manual Gateway Setup (SE80 / SEGW)
```
1. Tcode: SEGW
2. Create Project: ZCV_AGEING
3. Right-click "Data Models" → Create Data Model
4. Add Entity Type: CVAgeing (from Q_CV_AGEING_OD)
5. Add Entity Set: CVAgeingSet
6. Generate → Activate
7. Publish Service
```

### Option C: ADT Integration
```
1. Right-click Package → New → Service
2. Data Source: Q_CV_AGEING_OD
3. Name: ZCV_AGEING_SRV
4. Activate
```

---

## Step 5: Test OData Service

### Using Postman / REST Client:

1. **Basic Test:**
   ```
   GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$top=10
   Headers:
     Authorization: Basic <base64(user:password)>
     Accept: application/json
   ```

2. **Filter by Company:**
   ```
   GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$filter=CompanyCode eq '1000'&$top=50
   ```

3. **Filter by Customer:**
   ```
   GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$filter=CompanyCode eq '1000' and CustomerID eq 'CUST001'
   ```

4. **Get Specific Bucket:**
   ```
   GET /sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet?$filter=BucketKey eq '0TO30DAYS'&$select=CustomerID,CustomerName,AgingAmount
   ```

**Expected Response:**
```json
{
  "d": {
    "results": [
      {
        "CompanyCode": "1000",
        "CustomerID": "CUST001",
        "CustomerName": "ABC Manufacturing",
        "BucketKey": "0TO30DAYS",
        "BucketLabel": "0 to 30 Days",
        "AgingAmount": "50000.00",
        "TotalPerGroup": "200000.00"
      }
    ]
  }
}
```

---

## Step 6: Build Fiori Dashboard (Optional)

### Using ApexCharts (Recommended for your setup):

```javascript
// Data from OData service
const response = await fetch('/sap/opu/odata/sap/ZCV_AGEING_SRV/CVAgeingSet');
const data = await response.json();

// Transform for ApexCharts
const buckets = [...new Set(data.d.results.map(r => r.BucketLabel))];
const customers = [...new Set(data.d.results.map(r => r.CustomerID))];

const chart = new ApexCharts(document.getElementById('chart'), {
  chart: { type: 'bar' },
  xaxis: { categories: customers },
  series: buckets.map(bucket => ({
    name: bucket,
    data: customers.map(cust => 
      data.d.results
        .filter(r => r.CustomerID === cust && r.BucketLabel === bucket)
        .reduce((sum, r) => sum + parseFloat(r.AgingAmount), 0)
    )
  }))
});

chart.render();
```

---

## Step 7: Troubleshooting

### Issue: "View not activated"
**Solution:**
1. Check all CDS views for syntax errors
2. Verify table ZFI_CV_BUCKET exists
3. Clear ADT cache: Project → Clean

### Issue: "AMDP compilation error"
**Solution:**
1. Verify SAP HANA is available
2. Check SQLScript syntax (HANA specific)
3. Test CDS views individually first

### Issue: "No data returned from OData"
**Solution:**
1. Verify ZFI_CV_BUCKET has variant '001' data
2. Check ACDOCA contains transactions
3. Test with: `$top=1` to check connectivity
4. Add `$select=CompanyCode` to isolate issue

### Issue: "OData service activation failed"
**Solution:**
1. Re-create service in Gateway (SEGW)
2. Manually create entity set in SPRO
3. Check authorization (SICF_ACL, RFC_ACL)

---

## File Checklist

- [ ] ZFI_CV_BUCKET table created and populated
- [ ] I_CV_AGEING_MASTER.ddls activated
- [ ] I_CV_BUCKET_CONFIG.ddls activated
- [ ] CF_CV_AGEING.ddls activated
- [ ] I_CV_AGEING_RESULT.ddls activated
- [ ] Q_CV_AGEING_OD.ddls activated
- [ ] ZCL_CV_AGEING_AMDP class created & activated
- [ ] ZCV_AGEING_SRV OData service published
- [ ] Postman tests pass
- [ ] Fiori app created (optional)

---

## Next Steps

1. **Real-Time Sync:** Add incremental refresh for live aging updates
2. **Advanced Filters:** Implement drill-down by profit center
3. **Predictive Analytics:** Add forecasted aging based on payment patterns
4. **Mobile App:** Create SAPUI5 responsive dashboard
5. **Integration:** Connect to BW/Analytics Cloud for trend analysis

---

## Support

**Documentation:** See `CDS_AMDP_Implementation_Guide.md` for detailed technical info  
**Original Report:** `ZFI_CUST_VEND_AGING_RPT.abap` (for reference)  
**Questions?** Contact your Fiori Development Team

---

**Last Updated:** 2026-06-29  
**Version:** 1.0
