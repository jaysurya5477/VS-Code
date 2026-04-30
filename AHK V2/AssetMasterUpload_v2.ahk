#Requires AutoHotkey v2.0.18+
#SingleInstance Force

; ================================
; GLOBALS
; ================================
global sapGuiAuto := ""
global sapApplication := ""
global selectedClient := ""

; ================================
; HOTKEY
; ================================
#HotIf WinActive("ahk_exe EXCEL.EXE")
^!a:: AssetCreation()  ; Ctrl + Alt + A
#HotIf

; ================================
; MAIN FUNCTION
; ================================
AssetCreation() {
    global sapGuiAuto, sapApplication, selectedClient

    ; --- Connect to Excel ---
    try xl := ComObjActive("Excel.Application")
    catch {
        MsgBox "Excel is not open!", "Error"
        return
    }

    wb := xl.ActiveWorkbook
    ws := wb.ActiveSheet

    ; --- Validate Headers ---
    headers := Map(
        1,  "Asset Class",
        2,  "Description",
        3,  "Additional Description",
        4,  "Quantity",
        5,  "Unit of Measure",
        6,  "Cost Center",
        7,  "Plant",
        8,  "Profit Center",
        9,  "Dep Key 1",
        10, "Use Life 1",
        11, "Dep Key 2",
        12, "Use Life 2",
        13, "Status"
    )

    for col, expected in headers {
        actual := ws.Cells(1, col).Value
        if (actual != expected) {
            MsgBox "Header mismatch in column " col "`nExpected: " expected "`nFound: " actual, "Validation Error"
            return
        }
    }

    ; ================================
    ; SELECT CLIENT
    ; ================================
    clientResult := SelectClient()
    if (clientResult = "") {
        MsgBox "No client selected. Aborting.", "Cancelled"
        return
    }

    ; ================================
    ; CONNECT TO SAP
    ; ================================
    try {
        sapGuiAuto := ComObjGet("SAPGUI")
    } catch {
        sapLogonPath := "C:\Program Files\SAP\FrontEnd\SAPgui\saplogon.exe"
        if FileExist(sapLogonPath) {
            Run(sapLogonPath)
            Sleep(3000)
            try sapGuiAuto := ComObjGet("SAPGUI")
            catch {
                MsgBox "Could not connect to SAP GUI after launching SAP Logon.", "Error"
                return
            }
        } else {
            MsgBox "SAP Logon not found at: " sapLogonPath, "Error"
            return
        }
    }

    sapApplication := sapGuiAuto.GetScriptingEngine
    if !sapApplication {
        MsgBox "Could not get SAP scripting engine.", "Error"
        return
    }

    ; --- Find session matching selected client ---
    session := ""
    try {
        for connection in sapApplication.Connections {
            for sess in connection.Sessions {
                if (sess.Info.Client == clientResult) {
                    session := sess
                    break 2
                }
            }
        }
    }

    if (session = "") {
        MsgBox "No open SAP session found for client " clientResult ".", "Error"
        return
    }

    MsgBox "Connected to Client " clientResult " successfully!"

    lastRow := ws.Cells(ws.Rows.Count, 1).End(-4162).Row  ; xlUp

    loop lastRow - 1 {
        i := A_Index + 1
        skipRow := false

        ; --- Skip already processed rows ---
        existingStatus := ws.Cells(i, 13).Value
        if (existingStatus != "" && InStr(existingStatus, "Asset"))
            continue

        ; --- Read Data from Excel row ---
        asset       := ws.Cells(i, 1).Value
        desc        := ws.Cells(i, 2).Value
        add_desc    := ws.Cells(i, 3).Value
        quantity    := ws.Cells(i, 4).Value
        uom         := ws.Cells(i, 5).Value
        costcenter  := ws.Cells(i, 6).Value
        plant       := ws.Cells(i, 7).Value
        profitcenter := ws.Cells(i, 8).Value
        dep1        := ws.Cells(i, 9).Value
        life1       := ws.Cells(i, 10).Value
        dep2        := ws.Cells(i, 11).Value
        life2       := ws.Cells(i, 12).Value

        ; ================================
        ; STEP 1 — Navigate to AS01
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step1_NavigateAS01", [session])
        if skipRow
            continue

        ; ================================
        ; STEP 2 — Fill Asset Class + Company Code
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step2_FillAssetClassAndCompany", [session, asset])
        if skipRow
            continue

        ; ================================
        ; STEP 3 — Tab 1: General (Description, Qty, UoM)
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step3_FillGeneralTab", [session, desc, add_desc, quantity, uom])
        if skipRow
            continue

        ; ================================
        ; STEP 4 — Tab 2: Time-Dependent (Cost Center, Plant, Profit Center)
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step4_FillTimeDependentTab", [session, costcenter, plant, profitcenter])
        if skipRow
            continue

        ; ================================
        ; STEP 5 — Tab 8: Detect dep column positions, fill area 1
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step5_FillDepreciationArea1", [session, dep1, life1])
        if skipRow
            continue

        ; ================================
        ; STEP 6 — Tab 8: Fill depreciation area 2 (same detected positions)
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step6_FillDepreciationArea2", [session, dep2, life2])
        if skipRow
            continue

        ; ================================
        ; STEP 7 — Save the asset
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step7_SaveAsset", [session])
        if skipRow
            continue

        ; --- Handle save confirmation popup if present ---
        try {
            if (session.Children.Count > 1)
                session.findById("wnd[1]").sendVKey(0)
        }

        ; ================================
        ; STEP 8 — Read status bar and write asset number to Excel
        ; ================================
        SapStep(session, i, ws, &skipRow, "Step8_WriteStatus", [session, ws, i])
    }

    MsgBox "Process Completed!", "Done"
}

; ================================
; NAMED STEP FUNCTIONS
; Each receives explicit parameters — easy to set breakpoints,
; add ToolTip/logging, or test in isolation.
; ================================

Step1_NavigateAS01(session) {
    session.findById("wnd[0]/tbar[0]/okcd").Text := "/nas01"
    session.findById("wnd[0]").sendVKey(0)
}

Step2_FillAssetClassAndCompany(session, asset) {
    session.findById("wnd[0]/usr/ctxtANLA-ANLKL").Text := asset
    session.findById("wnd[0]/usr/ctxtANLA-BUKRS").Text := "1000"
    session.findById("wnd[0]/usr/txtRA02S-NASSETS").Text := "1"
    session.findById("wnd[0]/usr/txtRA02S-NASSETS").SetFocus()
    session.findById("wnd[0]/usr/txtRA02S-NASSETS").caretPosition := 1
    session.findById("wnd[0]").sendVKey(0)
}

Step3_FillGeneralTab(session, desc, add_desc, quantity, uom) {
    basePath := "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB01/ssubSUBSC:SAPLATAB:0200/subAREA1:SAPLAIST:1140/"

    session.findById(basePath . "txtANLA-TXT50").Text := desc
    session.findById(basePath . "txtANLA-TXA50").Text := add_desc
    session.findById(basePath . "txtANLA-MENGE").Text := quantity
    session.findById(basePath . "ctxtANLA-MEINS").Text := uom
    session.findById(basePath . "ctxtANLA-MEINS").SetFocus()
    session.findById(basePath . "ctxtANLA-MEINS").caretPosition := 3
    session.findById("wnd[0]").sendVKey(0)
}

Step4_FillTimeDependentTab(session, costcenter, plant, profitcenter) {
    session.findById("wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02").Select()

    basePath := "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1145/"

    session.findById(basePath . "ctxtANLZ-KOSTL").Text := costcenter
    session.findById(basePath . "ctxtANLZ-WERKS").Text := plant
    session.findById(basePath . "ctxtANLZ-PRCTR").Text := profitcenter
    session.findById(basePath . "ctxtANLZ-PRCTR").SetFocus()
    session.findById(basePath . "ctxtANLZ-PRCTR").caretPosition := 1
    session.findById("wnd[0]").sendVKey(0)
}

; ================================
; DetectDepColPositions()
; Checks whether the "Deactivate" checkbox column exists in the
; depreciation table on Tab 8. Returns a Map with AFASL and NDJAR
; column indices.
;
; Layout WITHOUT deactivate checkbox:  AFASL=2, NDJAR=3
; Layout WITH    deactivate checkbox:  AFASL=3, NDJAR=4
; ================================
DetectDepColPositions(session) {
    tablePath := "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1190/tblSAPLAISTTC_ANLB"

    afaslCol := 2   ; default: no deactivate checkbox
    ndjarCol := 3

    ; Try to find the checkbox cell at column index 0 (first row, col 0).
    ; If it exists, the deactivate column is present and all others shift by 1.
    try {
        chkPath := tablePath . "/chkANLB-XAFBE[0,0]"
        session.findById(chkPath)   ; throws if element not found
        ; Element found → checkbox column is present → shift columns
        afaslCol := 3
        ndjarCol := 4
    } catch {
        ; Element not found → no checkbox → use default column positions
        afaslCol := 2
        ndjarCol := 3
    }

    return Map("afasl", afaslCol, "ndjar", ndjarCol)
}

Step5_FillDepreciationArea1(session, dep1, life1) {
    ; Select Tab 8 first
    session.findById("wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08").Select()

    ; Detect whether the deactivate checkbox column is present
    cols := DetectDepColPositions(session)
    afaslCol := cols["afasl"]
    ndjarCol := cols["ndjar"]

    tablePath := "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1190/tblSAPLAISTTC_ANLB/"

    ; Row index 0 = first depreciation area
    session.findById(tablePath . "ctxtANLB-AFASL[" afaslCol ",0]").Text := dep1
    session.findById(tablePath . "txtANLB-NDJAR["  ndjarCol ",0]").Text := life1
    session.findById("wnd[0]").sendVKey(0)
}

Step6_FillDepreciationArea2(session, dep2, life2) {
    ; Tab 8 should already be active; detect columns again (same asset, same layout)
    cols := DetectDepColPositions(session)
    afaslCol := cols["afasl"]
    ndjarCol := cols["ndjar"]

    tablePath := "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1190/tblSAPLAISTTC_ANLB/"

    ; Row index 1 = second depreciation area
    session.findById(tablePath . "ctxtANLB-AFASL[" afaslCol ",1]").Text := dep2
    session.findById(tablePath . "txtANLB-NDJAR["  ndjarCol ",1]").Text := life2
    ; No sendVKey here — save step handles it
}

Step7_SaveAsset(session) {
    session.findById("wnd[0]").sendVKey(0)   ; confirm any pending messages
    session.findById("wnd[0]").sendVKey(0)   ; second confirm if needed
    session.findById("wnd[0]/tbar[0]/btn[11]").press()  ; Save button (Ctrl+S)
}

Step8_WriteStatus(session, ws, row) {
    statusText := session.findById("wnd[0]/sbar").Text
    ws.Cells(row, 13).Value := statusText
}

; ================================
; PER-STEP RETRY WRAPPER
;
; stepFuncName : String — the name of the function to call (e.g. "Step1_NavigateAS01")
; params       : Array  — arguments to pass to that function
;
; On SAP Error  : Retry / Skip row / Abort
; On AHK Error  : Retry / Skip row / Abort (full error detail shown)
; ================================
SapStep(session, row, ws, &skipRow, stepFuncName, params) {
    loop {
        try {
            ; Dynamically call the named function with its parameter array
            %stepFuncName%(params*)

            ; --- Check SAP status bar after every step ---
            msg  := session.findById("wnd[0]/sbar").Text
            type := session.findById("wnd[0]/sbar").MessageType

            if (type = "E") {
                choice := MsgBox(
                    "Step  : " stepFuncName "`n"
                    "Row   : " row "`n"
                    "Type  : " type "`n"
                    "SAP   : " msg "`n`n"
                    "Yes = Retry this step`n"
                    "No  = Skip row`n"
                    "Cancel = Abort",
                    "SAP Error — " stepFuncName,
                    "YesNoCancel Icon!"
                )
                if (choice = "Yes")
                    continue
                else if (choice = "No") {
                    ws.Cells(row, 13).Value := "SKIPPED: " msg
                    skipRow := true
                    return
                } else
                    ExitApp

            } else if (type = "W") {
                ; Warnings: acknowledge and continue
                session.findById("wnd[0]").sendVKey(0)
            }

            return  ; step succeeded

        } catch Error as e {
            choice := MsgBox(
                "Step  : " stepFuncName "`n"
                "Row   : " row "`n`n"
                "Message : " e.Message "`n"
                "What    : " e.What "`n"
                "File    : " e.File "`n"
                "Line    : " e.Line "`n`n"
                "Stack:`n" e.Stack "`n`n"
                "Yes = Retry this step`n"
                "No  = Skip row`n"
                "Cancel = Abort",
                "Runtime Error — " stepFuncName,
                "YesNoCancel IconX"
            )
            if (choice = "Yes")
                continue
            else if (choice = "No") {
                ws.Cells(row, 13).Value := "SKIPPED: " e.Message
                skipRow := true
                return
            } else
                ExitApp
        }
    }
}

; ================================
; CLIENT SELECTION GUI
; ================================
SelectClient() {
    global selectedClient
    selectedClient := ""

    myGui := Gui("+AlwaysOnTop", "Select SAP Client")
    myGui.SetFont("s11", "Segoe UI")

    myGui.AddText("xm w260 Center", "Choose SAP Client")

    btnW := 100
    btnH := 40

    myGui.AddButton("xm w" btnW " h" btnH, "100")
        .OnEvent("Click", (*) => ChooseClient("100", myGui))

    myGui.AddButton("x+20 w" btnW " h" btnH, "120")
        .OnEvent("Click", (*) => ChooseClient("120", myGui))

    myGui.AddButton("xm y+20 w" btnW " h" btnH, "200")
        .OnEvent("Click", (*) => ChooseClient("200", myGui))

    myGui.AddButton("x+20 w" btnW " h" btnH, "300")
        .OnEvent("Click", (*) => ChooseClient("300", myGui))

    myGui.Show("w300 h180 Center")
    WinWaitClose(myGui.Hwnd)

    return selectedClient
}

ChooseClient(client, guiObj, *) {
    global selectedClient
    selectedClient := client
    guiObj.Destroy()
}
