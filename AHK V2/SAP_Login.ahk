#Requires AutoHotkey v2.0.18+
#SingleInstance Force

; =============================================================================
; SAP GUI Auto-Login Script (AutoHotkey v2)
; Uses SAP GUI Scripting API to open connections and auto-fill credentials
; =============================================================================

; Path to the credentials config file (same folder as this script)
CONFIG_FILE := A_ScriptDir "\sap_config.ini"

; Default if file missing
if !FileExist(CONFIG_FILE) {
    MsgBox(
        "Config file not found!`n`nCreate 'sap_config.ini' with the following format:`n`n"
        "[ProfileName]`nConnectionName=YOUR_CONNECTION`nSID=XXX`nClient=100`nUser=username`nPassword=secret",
        "Missing Config", "Icon!"
    )
    return
}
; Read hotkey ; Register dynamically

launcherHotkey := IniRead(CONFIG_FILE, "Hotkeys", "MED100", "")
Hotkey(launcherHotkey, LoginToSAP.Bind("MED100"))

launcherHotkey := IniRead(CONFIG_FILE, "Hotkeys", "MED120", "")
Hotkey(launcherHotkey, LoginToSAP.Bind("MED120"))

launcherHotkey := IniRead(CONFIG_FILE, "Hotkeys", "MEQ200", "")
Hotkey(launcherHotkey, LoginToSAP.Bind("MEQ200"))

launcherHotkey := IniRead(CONFIG_FILE, "Hotkeys", "MEP300", "")
Hotkey(launcherHotkey, LoginToSAP.Bind("MEP300"))

; ^4:: LoginToSAP("MED120")


; --- Hotkey Bindings (Alt + Number) ---
; !1:: LoginToSAP("MED120")
; !2:: LoginToSAP("MEQ200")
; !3:: LoginToSAP("MEP300")
; !4:: LoginToSAP("MED100")

; =============================================================================
; MAIN LOGIN FUNCTION
; Reads config, checks for existing session, or opens a new connection
; =============================================================================
LoginToSAP(profileName, *) {
    global CONFIG_FILE

    Sleep(500)
    ; Ensure config file exists
    if !FileExist(CONFIG_FILE) {
        MsgBox(
            "Config file not found!`n`nCreate 'sap_config.ini' with the following format:`n`n"
            "[ProfileName]`nConnectionName=YOUR_CONNECTION`nSID=XXX`nClient=100`nUser=username`nPassword=secret",
            "Missing Config", "Icon!")
        return
    }

    ; Load credentials from the matching section
    connectionName := IniRead(CONFIG_FILE, profileName, "ConnectionName", "")
    sid := IniRead(CONFIG_FILE, profileName, "SID", "")
    client := IniRead(CONFIG_FILE, profileName, "Client", "")
    username := IniRead(CONFIG_FILE, profileName, "User", "")
    password := IniRead(CONFIG_FILE, profileName, "Password", "")

    ; Abort if any field is missing
    if (connectionName = "" || sid = "" || client = "" || username = "" || password = "") {
        MsgBox("One or more fields are missing in the [" profileName "] section.`n`n"
            "Required: ConnectionName, SID, Client, User, Password", "Incomplete Config", "Icon!")
        return
    }

    try {
        ; Connect to SAP GUI scripting engine
        if !InitializeSAP()
            return

        ; If a matching session is already open, bring it to the foreground
        existingSession := FindExistingSession(sid, client, username)
        if existingSession {
            hwnd := existingSession.findById("wnd[0]").Handle
            BringWindowToFront(hwnd)
            return
        }

        ; No existing session — open a fresh connection and log in
        OpenAndLogin(connectionName, client, username, password)
        return

    } catch as err {
        MsgBox("Unexpected error: " err.Message, "Error", "Icon!")
    }
}

; =============================================================================
; SAP INITIALIZATION
; Connects to a running SAP GUI instance (launches SAP Logon if not running)
; =============================================================================
global sapGuiAuto, sapApplication

InitializeSAP() {
    global sapGuiAuto, sapApplication

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

        return true

    } catch as err {
        MsgBox("SAP initialization failed: " err.Message, "Error", "Icon!")
        return false
    }
}

; =============================================================================
; SESSION SEARCH
; Loops through all open connections/sessions to find a matching one
; =============================================================================
FindExistingSession(sid, client, username) {
    global sapApplication

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
; OPEN NEW CONNECTION AND LOG IN
; Opens a connection by name, fills in credentials, handles multi-login prompt
; =============================================================================
global sapConnection, sapSession

OpenAndLogin(connectionName, client, username, password) {
    global sapApplication, sapConnection, sapSession

    try {
        ; Open the connection (True = make it visible)
        sapConnection := sapApplication.OpenConnection(connectionName, True)
        if !sapConnection {
            MsgBox("Could not open connection: " connectionName, "Error", "Icon!")
            return
        }

        Sleep(1000) ; Wait for the connection window to appear

        ; Get the first available session
        if sapConnection.Sessions.Count < 1 {
            MsgBox("Connection opened but no session is available.", "Error", "Icon!")
            return
        }
        sapSession := sapConnection.Sessions.Item(0)

        Sleep(100)

        ; Fill in the login form
        sapSession.findById("wnd[0]/usr/txtRSYST-MANDT").Text := client
        Sleep(100)
        sapSession.findById("wnd[0]/usr/txtRSYST-BNAME").Text := username
        Sleep(100)
        sapSession.findById("wnd[0]/usr/pwdRSYST-BCODE").Text := password
        Sleep(100)

        ; Submit the login form (Enter key)
        sapSession.findById("wnd[0]").sendVKey(0)

        ; ; Handle "user already logged in" dialog, if it appears
        try {
            if sapSession.findById("wnd[1]").Visible {
                ; Select option 3: terminate previous session and continue with this one
                sapSession.findById("wnd[1]/usr/radMULTI_LOGON_OPT3").Select()
                sapSession.findById("wnd[1]/tbar[0]/btn[0]").Press()
            }
        } catch {

        }

        return

    } catch as err {
        MsgBox("Login failed: " err.Message, "Error", "Icon!")
    }
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

; =============================================================================
; UTILITIES (optional helpers — uncomment to use)
; =============================================================================

; Navigate to a transaction code in the current session
; ExecuteTransaction(transCode) {
;     global sapSession
;     if sapSession {
;         sapSession.findById("wnd[0]/tbar[0]/okcd").Text := "/n" transCode
;         sapSession.findById("wnd[0]").sendVKey(0)
;     }
; }

; Close the current SAP connection
; CloseSAPConnection() {
;     global sapConnection
;     try sapConnection.CloseConnection()
; }

; =============================================================================
; FIRST-RUN SETUP
; Creates a sample sap_config.ini if one doesn't already exist
; =============================================================================
; CreateSampleConfig() {
;     global CONFIG_FILE

;     if FileExist(CONFIG_FILE)
;         return

;     template :=
;         (
;             "[MED120]
;         ; Connection name as shown in SAP Logon pad
;         ConnectionName=YOUR_CONNECTION_NAME
;         SID=MED
;         Client=120
;         User=YOUR_USERNAME
;         Password=YOUR_PASSWORD

;         [MEQ200]
;         ConnectionName=YOUR_CONNECTION_NAME
;         SID=MEQ
;         Client=200
;         User=YOUR_USERNAME
;         Password=YOUR_PASSWORD"
;         )

;     try {
;         FileAppend(template, CONFIG_FILE)
;         MsgBox("Sample config created at:`n" CONFIG_FILE "`n`nEdit it with your SAP credentials before using the hotkeys.",
;             "First Run")
;     } catch {
;         MsgBox("Could not create config file.", "Error", "Icon!")
;     }
; }

; CreateSampleConfig()