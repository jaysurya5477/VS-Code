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
        1, "Asset Class",
        2, "Description",
        3, "Additional Description",
        4, "Quantity",
        5, "Unit of Measure",
        6, "Cost Center",
        7, "Plant",
        8, "Profit Center",
        9, "Dep Key 1",
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

        ; --- Read Data ---
        asset := ws.Cells(i, 1).Value
        desc := ws.Cells(i, 2).Value
        add_desc := ws.Cells(i, 3).Value
        quantity := ws.Cells(i, 4).Value
        uom := ws.Cells(i, 5).Value
        costcenter := ws.Cells(i, 6).Value
        plant := ws.Cells(i, 7).Value
        profitcenter := ws.Cells(i, 8).Value
        dep1 := ws.Cells(i, 9).Value
        life1 := ws.Cells(i, 10).Value
        dep2 := ws.Cells(i, 11).Value
        life2 := ws.Cells(i, 12).Value

        ; ================================
        ; SCREEN 1 — Navigate to AS01
        ; ================================
        SapStep(session, i, ws, &skipRow, () => (
            session.findById("wnd[0]/tbar[0]/okcd").Text := "/nas01",
            session.findById("wnd[0]").sendVKey(0)
        ))
        if skipRow
            continue

        ; ================================
        ; SCREEN 1 — Fill Asset Class + Company Code
        ; ================================
        SapStep(session, i, ws, &skipRow, () => (
            session.findById("wnd[0]/usr/ctxtANLA-ANLKL").Text := asset,
            session.findById("wnd[0]/usr/ctxtANLA-BUKRS").Text := "1000",
            session.findById("wnd[0]/usr/txtRA02S-NASSETS").Text := "1",
            session.findById("wnd[0]/usr/txtRA02S-NASSETS").SetFocus(),
            session.findById("wnd[0]/usr/txtRA02S-NASSETS").caretPosition := 1,
            session.findById("wnd[0]").sendVKey(0)
        ))
        if skipRow
            continue

        ; ================================
        ; TAB 1 — General (Description, Qty, UoM)
        ; ================================
        SapStep(session, i, ws, &skipRow, () => (
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB01/ssubSUBSC:SAPLATAB:0200/subAREA1:SAPLAIST:1140/txtANLA-TXT50"
            ).Text := desc,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB01/ssubSUBSC:SAPLATAB:0200/subAREA1:SAPLAIST:1140/txtANLA-TXA50"
            ).Text := add_desc,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB01/ssubSUBSC:SAPLATAB:0200/subAREA1:SAPLAIST:1140/txtANLA-MENGE"
            ).Text := quantity,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB01/ssubSUBSC:SAPLATAB:0200/subAREA1:SAPLAIST:1140/ctxtANLA-MEINS"
            ).Text := uom,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB01/ssubSUBSC:SAPLATAB:0200/subAREA1:SAPLAIST:1140/ctxtANLA-MEINS"
            ).SetFocus(),
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB01/ssubSUBSC:SAPLATAB:0200/subAREA1:SAPLAIST:1140/ctxtANLA-MEINS"
            ).caretPosition := 3,
            session.findById("wnd[0]").sendVKey(0)
        ))
        if skipRow
            continue

        ; ================================
        ; TAB 2 — Time-Dependent (Cost Center, Plant, Profit Center)
        ; ================================
        SapStep(session, i, ws, &skipRow, () => (
            session.findById("wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02").Select(),
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1145/ctxtANLZ-KOSTL"
            ).Text := costcenter,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1145/ctxtANLZ-WERKS"
            ).Text := plant,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1145/ctxtANLZ-PRCTR"
            ).Text := profitcenter,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1145/ctxtANLZ-PRCTR"
            ).SetFocus(),
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB02/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1145/ctxtANLZ-PRCTR"
            ).caretPosition := 1,
            session.findById("wnd[0]").sendVKey(0)
        ))
        if skipRow
            continue

        ; ================================
        ; TAB 8 — Depreciation area 1
        ; ================================
        SapStep(session, i, ws, &skipRow, () => (
            session.findById("wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08").Select(),
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1190/tblSAPLAISTTC_ANLB/ctxtANLB-AFASL[3,0]"
            ).Text := dep1,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1190/tblSAPLAISTTC_ANLB/txtANLB-NDJAR[4,0]"
            ).Text := life1,
            session.findById("wnd[0]").sendVKey(0)
        ))
        if skipRow
            continue

        ; ================================
        ; TAB 8 — Depreciation area 2
        ; ================================
        SapStep(session, i, ws, &skipRow, () => (
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1190/tblSAPLAISTTC_ANLB/ctxtANLB-AFASL[3,1]"
            ).Text := dep2,
            session.findById(
                "wnd[0]/usr/subTABSTRIP:SAPLATAB:0100/tabsTABSTRIP100/tabpTAB08/ssubSUBSC:SAPLATAB:0201/subAREA1:SAPLAIST:1190/tblSAPLAISTTC_ANLB/txtANLB-NDJAR[4,1]"
            ).Text := life2
        ))
        if skipRow
            continue

        ; ================================
        ; SAVE
        ; ================================
        SapStep(session, i, ws, &skipRow, () => (
            session.findById("wnd[0]").sendVKey(0),
            session.findById("wnd[0]").sendVKey(0),
            session.findById("wnd[0]/tbar[0]/btn[11]").press()
        ))
        if skipRow
            continue

        ; --- Handle save confirmation popup ---
        try {
            if (session.Children.Count > 1)
                session.findById("wnd[1]").sendVKey(0)
        }

        ; --- Final status check + write asset number to Status column ---
        SapStep(session, i, ws, &skipRow, () => (
            ws.Cells(i, 13).Value := session.findById("wnd[0]/sbar").Text
        ))
    }

    MsgBox "Process Completed!", "Done"
}

; ================================
; PER-STEP RETRY WRAPPER
; Runs the given Func. On SAP E/W: asks Retry/Skip/Abort.
; Retry re-runs only this step. Skip sets skipRow=true so the
; main loop moves to the next row. Abort exits the script.
; ================================
SapStep(session, row, ws, &skipRow, stepFunc) {
    loop {
        try {
            stepFunc()
            ; Check SAP status bar after every step
            msg := session.findById("wnd[0]/sbar").Text
            type := session.findById("wnd[0]/sbar").MessageType
            if (type = "E") {
                choice := MsgBox(
                    "Row: " row "`nType: " type "`nMessage: " msg "`n`nYes = Retry this step   No = Skip row   Cancel = Abort",
                    "SAP Message",
                    "YesNoCancel Icon!"
                )
                if (choice = "Yes")
                    continue           ; retry only this step
                else if (choice = "No") {
                    ws.Cells(row, 13).Value := "SKIPPED: " msg
                    skipRow := true
                    return
                } else
                    ExitApp
            } else if (type = "W") {
                session.findById("wnd[0]").sendVKey(0)
            }
            return  ; step succeeded — exit the retry loop
        } catch Error as e {
            choice := MsgBox(
                "Row: " row "`n`n"
                "Message: " e.Message "`n"
                "What: " e.What "`n"
                "File: " e.File "`n"
                "Line: " e.Line "`n`n"
                "Stack:`n" e.Stack "`n`n"
                "---------------------------`n"
                "Yes = Retry this step`n"
                "No = Skip row`n"
                "Cancel = Abort",
                "Runtime Error",
                "YesNoCancel IconX"
            )
            if (choice = "Yes")
                continue           ; retry only this step
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

    ; --- Title ---
    myGui.AddText("xm w260 Center", "Choose SAP Client")

    ; --- Buttons (Grid layout) ---
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

    ; --- Show with fixed size ---
    myGui.Show("w300 h180 Center")

    WinWaitClose(myGui.Hwnd)

    return selectedClient
}

; SelectClient() {
;     global selectedClient
;     selectedClient := ""

;     mygui := Gui("+AlwaysOnTop", "Select SAP Client")
;     mygui.SetFont("s10")
;     mygui.AddText(, "Choose Client:")

;     mygui.AddButton("w80", "100").OnEvent("Click", ChooseClient.Bind("100", mygui))
;     mygui.AddButton("x+10 w80", "120").OnEvent("Click", ChooseClient.Bind("120", mygui))
;     mygui.AddButton("xm w80", "200").OnEvent("Click", ChooseClient.Bind("200", mygui))
;     mygui.AddButton("x+10 w80", "300").OnEvent("Click", ChooseClient.Bind("300", mygui))

;     mygui.Show()
;     WinWaitClose(mygui.Hwnd)

;     return selectedClient
; }

ChooseClient(client, guiObj, *) {
    global selectedClient
    selectedClient := client
    guiObj.Destroy()
}

; ================================
; SAP STATUS BAR HANDLER
; ================================
HandleSAP(session, row, ws) {
    msg := session.findById("wnd[0]/sbar").Text
    type := session.findById("wnd[0]/sbar").MessageType

    if (type = "E" || type = "W") {
        choice := MsgBox(
            "Row: " row "`nType: " type "`nMessage: " msg "`n`nYes = Retry   No = Skip   Cancel = Abort",
            "SAP Message",
            "YesNoCancel Icon!"
        )
        if (choice = "Yes") {
            throw Error("Retry")
        } else if (choice = "No") {
            ws.Cells(row, 13).Value := "SKIPPED: " msg
            throw Error("Skip")
        } else {
            throw Error("Abort")
        }
    }
}
