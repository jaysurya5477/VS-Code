#Requires AutoHotkey v2.0
#SingleInstance Force

; ---------------------------
; Hotkeys
; ---------------------------

^1::LoginSAP("ALIMCO DEV S4", "100", "HBTADMIN", "HighbarAlimco^33")
^2::LoginSAP("ALIMCO QAS S4", "200", "HBTADMIN", "Abap@Hbt!@#$%987654")
^3::LoginSAP("ALIMCO PRD S4", "300", "HBTADMIN", "Abap@Hbt!@#$%987654")
^4::LoginSAP("ALIMCO DEV S4", "120", "HBTABAP",  "HighbarAlimco^33")

; ---------------------------
; Main Login Function
; ---------------------------

LoginSAP(systemName, client, username, password) {

    sapLogonPath := "C:\Program Files\SAP\FrontEnd\SAPGUI\saplogon.exe"

    if !ProcessExist("saplogon.exe") {
        if FileExist(sapLogonPath) {
            Run(sapLogonPath)
            WinWaitActive("SAP Logon")
            Sleep(3000)
        } else {
            MsgBox("SAP Logon not found at: " sapLogonPath, "Error", "Icon!")
            return
        }
    }

    try
        oGui := ComObjGet("SAPGUI")
    catch {
        MsgBox("SAP GUI scripting engine not available.", "Error", "Icon!")
        return
    }

    oApp := oGui.GetScriptingEngine
    oConnection := oApp.OpenConnection(systemName, true)

    Sleep(1500)

    oSession := oConnection.Sessions.Item(0)

    oSession.findById("wnd[0]/usr/txtRSYST-MANDT").text := client
    oSession.findById("wnd[0]/usr/txtRSYST-BNAME").text := username
    oSession.findById("wnd[0]/usr/pwdRSYST-BCODE").text := password
    oSession.findById("wnd[0]/usr/txtRSYST-LANGU").text := "EN"

    oSession.findById("wnd[0]").sendVKey(0)
}