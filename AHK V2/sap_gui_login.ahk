#Requires AutoHotkey v2.0
#SingleInstance Force

^1:: LoginToSAP("MED100")
^2:: LoginToSAP("MEQ200")
^3:: LoginToSAP("MEP300")
^4:: LoginToSAP("MED120")

LoginToSAP(profileName) {

    ; Configuration file path
    configFile := A_ScriptDir . "\sap_config.ini"

    ; Default if file missing
    if !FileExist(configFile) {
        MsgBox(
            "Config file not found!"
        )
        return
    }

    ; Load credentials from the matching section
    connectionName := IniRead(configFile, profileName, "ConnectionName", "")
    sid := IniRead(configFile, profileName, "SID", "")
    client := IniRead(configFile, profileName, "Client", "")
    username := IniRead(configFile, profileName, "User", "")
    password := IniRead(configFile, profileName, "Password", "")

    ; Abort if any field is missing
    if (connectionName = "" || sid = "" || client = "" || username = "" || password = "") {
        MsgBox("One or more fields are missing in the [" profileName "] section.`n`n"
            "Required: ConnectionName, SID, Client, User, Password", "Incomplete Config", "Icon!")
        return
    }

    try {
        ; Connect to SAP GUI scripting engine
        if !sapApplication := InitializeSAP()
            return

        ; If a matching session is already open, bring it to the foreground
        existingSession := FindExistingSession(sid, client, username, sapApplication)
        if existingSession {
            hwnd := existingSession.findById("wnd[0]").Handle
            BringWindowToFront(hwnd)
            return
        }

        ; No existing session — open a fresh connection and log in
        OpenAndLogin(connectionName, client, username, password, sapApplication)
        return

    } catch as err {
        MsgBox("Unexpected error: " err.Message, "Error", "Icon!")
    }

}

InitializeSAP() {

    SAP_LOGON_PATH := "C:\Program Files\SAP\FrontEnd\SAPgui\saplogon.exe"

    try {
        ; Try to attach to an already-running SAP GUI
        try {
            sapGuiAuto := ComObjGet("SAPGUI")
        } catch {
            ; SAP not running — launch it and wait for it to load
            if !FileExist(SAP_LOGON_PATH) {
                MsgBox("SAP Logon not found at:`n" SAP_LOGON_PATH, "Error", "Icon!")
                return false
            }
            Run(SAP_LOGON_PATH)
            Sleep(3000)
            sapGuiAuto := ComObjGet("SAPGUI")
        }

        if !sapGuiAuto {
            MsgBox("Could not connect to SAP GUI.", "Error", "Icon!")
            return false
        }

        ; Get the scripting engine from the SAP GUI object
        sapApplication := sapGuiAuto.GetScriptingEngine
        if !sapApplication {
            MsgBox("Could not retrieve the SAP scripting engine.", "Error", "Icon!")
            return false
        }

        return sapApplication

    } catch as err {
        MsgBox("SAP initialization failed: " err.Message, "Error", "Icon!")
        return false
    }
}

OpenAndLogin(connectionName, client, username, password, sapApplication) {

    oConnection := sapApplication.OpenConnection(connectionName, true)

    Sleep(1500)

    oSession := oConnection.Sessions.Item(0)

    oSession.findById("wnd[0]/usr/txtRSYST-MANDT").text := client
    oSession.findById("wnd[0]/usr/txtRSYST-BNAME").text := username
    oSession.findById("wnd[0]/usr/pwdRSYST-BCODE").text := password
    oSession.findById("wnd[0]/usr/txtRSYST-LANGU").text := "EN"

    oSession.findById("wnd[0]").sendVKey(0)
}

; SESSION SEARCH
; Loops through all open connections/sessions to find a matching one
; =============================================================================
FindExistingSession(sid, client, username, sapApplication) {

    try {
        for connection in sapApplication.Connections {
            for session in connection.Sessions {
                info := session.Info
                if (info.SystemName == sid && info.Client == client && info.User == username)
                    return session
            }
        }
    } catch {
        ; No sessions open yet — silently ignore
    }

    return false
}

; =============================================================================
; WINDOW MANAGEMENT
; Restores and brings an SAP session window to the foreground
; =============================================================================
BringWindowToFront(hwnd) {
    ; Get the current foreground window so we can attach thread input
    fgHwnd := DllCall("GetForegroundWindow", "ptr")

    fgThreadId := DllCall("GetWindowThreadProcessId", "ptr", fgHwnd, "uint*", 0)
    sapThreadId := DllCall("GetWindowThreadProcessId", "ptr", hwnd, "uint*", 0)

    ; Temporarily link input queues so SetForegroundWindow works reliably
    DllCall("AttachThreadInput", "uint", fgThreadId, "uint", sapThreadId, "int", true)

    ; Restore the window if minimized
    if WinGetMinMax("ahk_id " hwnd) = -1
        WinRestore("ahk_id " hwnd)

    Sleep(400)
    WinShow("ahk_id " hwnd)
    DllCall("SetForegroundWindow", "ptr", hwnd)
    WinActivate("ahk_id " hwnd)

    ; Detach input queues
    DllCall("AttachThreadInput", "uint", fgThreadId, "uint", sapThreadId, "int", false)
}
