#Requires AutoHotkey v2.0.18+
#SingleInstance Force

; SAP GUI Login Hotkey Script - AutoHotkey v2
; Uses OpenConnection method from SAP GUI Scripting API

; Configuration file path
configFile := A_ScriptDir . "\sap_config.ini"

loginToSAP(info) {
    try {
        ; Read credentials from config file
        if !FileExist(configFile) {
            MsgBox(
                "Config file not found! Please create sap_config.ini with:`n[SAP]`nConnectionName=YOUR_CONNECTION_NAME`nClient=XXX`nUser=YOUR_USERNAME`nPassword=YOUR_PASSWORD",
                "Error", "Icon!")
            return
        }

        ; Read configuration
        connectionName := IniRead(configFile, info, "ConnectionName", "")
        sid := IniRead(configFile, info, "SID", "")
        client := IniRead(configFile, info, "Client", "")
        username := IniRead(configFile, info, "User", "")
        password := IniRead(configFile, info, "Password", "")

        ; Validate config
        if (connectionName = "" || sid = "" || client = "" || username = "" || password = "") {
            MsgBox("Please fill all fields in config file:`nConnectionName, sid, Client, User, Password", "Error",
                "Icon!")
            return
        }

        ; Initialize SAP GUI Scripting
        if !InitializeSAP() {
            return
        }
        session := FindExistingSession(sid, client, username)
        ; Check if SAP session with specified connection is already open
        if session {
            ; Session exists, just activate it
            hwnd := session.findById("wnd[0]").Handle
            ; WinActivate("ahk_id " session.findById("wnd[0]").Handle)
            DisplayActiveSession(hwnd)
            return
        }

        ; No session found, open new connection
        OpenSAPConnection(connectionName, client, username, password)

    } catch as err {
        MsgBox("Error: " . err.Message, "Script Error", "Icon!")
    }
}

; Hotkey: Alt
!1::loginToSAP("MED120")
!2::loginToSAP("MEQ200")
!3::loginToSAP("MEP300")
!4::loginToSAP("MED100")

; Global variables for SAP COM objects
global sapGuiAuto, sapApplication, sapConnection, sapSession

; Initialize SAP GUI Scripting
InitializeSAP() {
    global sapGuiAuto, sapApplication

    try {
        ; Try to get running SAP GUI instance
        try {
            sapGuiAuto := ComObjGet("SAPGUI")
        } catch {
            ; If not running, start SAP Logon
            sapLogonPath := "C:\Program Files\SAP\FrontEnd\SAPgui\saplogon.exe"
            if FileExist(sapLogonPath) {
                Run(sapLogonPath)
                Sleep(3000)
                sapGuiAuto := ComObjGet("SAPGUI")
            } else {
                MsgBox("SAP Logon not found at: " . sapLogonPath, "Error", "Icon!")
                return false
            }
        }

        ; Get scripting engine
        if !sapGuiAuto {
            MsgBox("Could not connect to SAP GUI", "Error", "Icon!")
            return false
        }

        sapApplication := sapGuiAuto.GetScriptingEngine
        if !sapApplication {
            MsgBox("Could not get SAP scripting engine", "Error", "Icon!")
            return false
        }

        return true

    } catch as err {
        MsgBox("SAP initialization error: " . err.Message, "Error", "Icon!")
        return false
    }
}

; Find existing session with the specified connection name
FindExistingSession(sid, client, username) {
    global sapApplication

    try {
        ; Loop through all connections
        for connection in sapApplication.Connections {
            for session in connection.Sessions {
                if (session.Info.SystemName == sid
                    and session.Info.Client == client
                    and session.Info.User == username) {
                    return session
                }
            }
        }
    } catch {
        ; No existing sessions found
    }

    return false
}

; Open new SAP connection and login
OpenSAPConnection(connectionName, client, username, password) {
    global sapApplication, sapConnection, sapSession

    try {
        ; Open connection using the connection name from SAP Logon
        ; The second parameter (True) makes the connection visible
        sapConnection := sapApplication.OpenConnection(connectionName, True)

        if !sapConnection {
            MsgBox("Could not open connection: " . connectionName, "Error", "Icon!")
            return
        }

        ; Get the first session
        if sapConnection.Sessions.Count > 0 {
            sapSession := sapConnection.Sessions.Item(0)
        } else {
            MsgBox("No session available", "Error", "Icon!")
            return
        }

        ; Wait for login window
        Sleep(100)

        ; Fill login credentials
        ; Client field
        sapSession.findById("wnd[0]/usr/txtRSYST-MANDT").Text := client
        Sleep(100)

        ; Username field
        sapSession.findById("wnd[0]/usr/txtRSYST-BNAME").Text := username
        Sleep(100)

        ; Password field
        sapSession.findById("wnd[0]/usr/pwdRSYST-BCODE").Text := password
        Sleep(100)

        ; Press Enter to login
        sapSession.findById("wnd[0]").sendVKey(0)


        ; Check if multi-login dialog appears
        try {
            ; If multi-login dialog exists, handle it
            if sapSession.findById("wnd[1]").Visible {
                ; Option 3: "End current logon and continue with this one"
                sapSession.findById("wnd[1]/usr/radMULTI_LOGON_OPT3").Select()
                sapSession.findById("wnd[1]/tbar[0]/btn[0]").Press()
            }
        } catch {
            ; No multi-login dialog, continue
        }

    } catch as err {
        MsgBox("Error opening connection: " . err.Message, "Error", "Icon!")
    }
}

; Alternative method: Open connection by connection string
OpenSAPConnectionByString(connectionString, client, username, password) {
    global sapApplication, sapConnection, sapSession

    try {
        ; Open connection using connection string
        ; Format: "/H/<host>/S/<port>/R/<system>"
        sapConnection := sapApplication.OpenConnectionByConnectionString(connectionString)

        if !sapConnection {
            MsgBox("Could not open connection with string: " . connectionString, "Error", "Icon!")
            return
        }

        ; Get the first session
        sapSession := sapConnection.Sessions.Item(0)

        ; Fill login credentials (same as above)
        sapSession.findById("wnd[0]/usr/txtRSYST-MANDT").Text := client
        sapSession.findById("wnd[0]/usr/txtRSYST-BNAME").Text := username
        sapSession.findById("wnd[0]/usr/pwdRSYST-BCODE").Text := password
        sapSession.findById("wnd[0]").sendVKey(0)

    } catch as err {
        MsgBox("Error opening connection by string: " . err.Message, "Error", "Icon!")
    }
}

; Function to execute a transaction after login
ExecuteTransaction(transactionCode) {
    global sapSession

    try {
        if sapSession {
            ; Enter transaction code in OK field
            sapSession.findById("wnd[0]/tbar[0]/okcd").Text := "/n" . transactionCode
            sapSession.findById("wnd[0]").sendVKey(0)
        }
    } catch as err {
        MsgBox("Error executing transaction: " . err.Message, "Error", "Icon!")
    }
}

; Function to close connection
CloseSAPConnection() {
    global sapConnection

    try {
        if sapConnection {
            sapConnection.CloseConnection()
        }
    } catch {
        ; Ignore errors on close
    }
}

; Optional: Create sample config file on first run
CreateSampleConfig() {
    global configFile

    if !FileExist(configFile) {
        sampleContent := "[SAP]`n"
        sampleContent .= "; Connection name as it appears in SAP Logon (e.g., PRD - Production)`n"
        sampleContent .= "ConnectionName=YOUR_CONNECTION_NAME`n"
        sampleContent .= "Client=100`n"
        sampleContent .= "User=YOUR_USERNAME`n"
        sampleContent .= "Password=YOUR_PASSWORD`n"

        try {
            FileAppend(sampleContent, configFile)
            MsgBox("Sample config file created at: " . configFile .
                "`n`nPlease edit this file with your SAP credentials.", "Config Created")
        } catch {
            MsgBox("Could not create config file", "Error", "Icon!")
        }
    }
}

; Uncomment the next line to create sample config on first run
CreateSampleConfig()

DisplayActiveSession(hwnd) {
    WinActivate("ahk_exe saplogon.exe")
    WinActivate("ahk_class SAP_FRONTEND_SESSION")

    fg := DllCall("GetForegroundWindow", "ptr")

    ; Attach input queues
    DllCall("AttachThreadInput"
        , "uint", DllCall("GetWindowThreadProcessId", "ptr", fg, "uint*", 0)
        , "uint", DllCall("GetWindowThreadProcessId", "ptr", hwnd, "uint*", 0)
        , "int", true)

    ; Only restore if minimized
    if WinGetMinMax("ahk_id " hwnd) = -1 {
        WinRestore "ahk_id " hwnd
    }

    Sleep 400
    WinShow "ahk_id " hwnd
    DllCall("SetForegroundWindow", "ptr", hwnd)
    WinActivate "ahk_id " hwnd

    ; Detach input queues
    DllCall("AttachThreadInput"
        , "uint", DllCall("GetWindowThreadProcessId", "ptr", fg, "uint*", 0)
        , "uint", DllCall("GetWindowThreadProcessId", "ptr", hwnd, "uint*", 0)
        , "int", false)
}
