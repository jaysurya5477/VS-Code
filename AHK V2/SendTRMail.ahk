#Requires AutoHotkey v2.0
#SingleInstance Force


; F8:: Reload()
; MsgBox("reloaded", "Reload", "T0.5")

#HotIf WinActive("ahk_class SAP_FRONTEND_SESSION")

^c:: {
    Send "^c"
    ClipWait 0.5

    Sleep(500)
    filePath := A_ScriptDir "\TRs.txt"   ; Change this to your file
    delayMs := 500                       ; Delay between pastes (in milliseconds)

    if !FileExist(filePath) {
        FileAppend "", filePath   ; create file if missing
    }

    ClipText := A_Clipboard
    if (!ClipText)
        return

    Lines := StrSplit(ClipText, ["`r", "`n"])

    ; First, read existing content from file to check for duplicates
    existingContent := ""
    try {
        existingContent := FileRead(filePath)
    }

    ; Array to track new lines (excluding duplicates)
    newLines := []

    for line in Lines {
        line := Trim(line)

        if (SubStr(line, 1, 4) = "MEDK") {
            ; Check if line already exists in file
            if (existingContent != "" && InStr(existingContent, line "`n")) {
                continue ; Skip duplicate
            }

            ; Also check against other new lines we're adding
            isDuplicate := false
            for newLine in newLines {
                if (newLine = line) {
                    isDuplicate := true
                    break
                }
            }

            if (!isDuplicate) {
                newLines.Push(line)
            }
        }
    }

    ; Append new non-duplicate lines to file
    if (newLines.Length > 0) {
        for line in newLines {
            FileAppend(line "`n", filePath)
        }

        ; Optional: Show confirmation message
        ; ToolTip "Added " newLines.Length " new TRs to file"
        ; Sleep(1000)
        ; ToolTip
    }
}

; Ctrl+Q hotkey to clear clipboard
^q:: {
    ; Clear TR file after mail
    ; -----------------------------
    filePath := A_ScriptDir "\TRs.txt"
    FileDelete filePath
    FileAppend "", filePath
    
    ; Optional: Show visual feedback
    ToolTip "Clipboard cleared!"
    Sleep(500)
    ToolTip ; Remove the tooltip
    
    ; Optional: Play a subtle sound (uncomment if you want sound)
    ; SoundBeep(1000, 100)
}

#HotIf

; ---------------------------------------------------
; Right Alt + M → Generate Mail (from TRs.txt)
; ---------------------------------------------------
^m:: 
{
    ; -----------------------------
    ; Module → Email mapping
    ; -----------------------------
    ModuleEmails := Map(
        "PP", "hemendra.patidar@alimco.in",
        "QM", "hemendra.patidar@alimco.in",
        "MM", "anurag.singh@alimco.in",
        "SD", "suraj.karki@highbartech.com;vishal.singh@highbartech.com",
        "HCM", "satypal.singh@highbartech.com",
        "HR", "satypal.singh@highbartech.com",
        "PM", "virendra.rathore@highbartech.com"
    )

    DefaultCC := "ketan.deshpande@highbartech.com"

    filePath := A_ScriptDir "\TRs.txt"

    if !FileExist(filePath) {
        MsgBox "TR file not found!"
        return
    }

    content := FileRead(filePath)
    if (content = "") {
        MsgBox "TR file is empty!"
        return
    }

    lines := StrSplit(content, ["`r", "`n"])

    ; -----------------------------
    ; Build TR HTML + detect modules
    ; -----------------------------
    TRHtml := "<ul>"
    CCSet := Map()   ; to avoid duplicate CCs

    for line in lines {
        line := Trim(line)
        if (line = "")
            continue

        TRHtml .= "<li>" line "</li>`n"

        ; Check which module exists in TR line
        for module, email in ModuleEmails {
            ; if InStr(line, module)
            ;     CCSet[email] := true
            ; Match module as a standalone token only
            if RegExMatch(line, "(^|\s)" module "(\s|:|$)") {
                ; A module may map to multiple emails (semicolon-separated)
                for addr in StrSplit(email, ";")
                    if (Trim(addr) != "")
                        CCSet[Trim(addr)] := true
            }
        }
    }
    TRHtml .= "</ul>"

    ; -----------------------------
    ; Build CC list
    ; -----------------------------
    CCList := DefaultCC

    for email in CCSet
        CCList .= ";" email

    ; -----------------------------
    ; Create Outlook Mail
    ; -----------------------------
    outlook := ComObject("Outlook.Application")
    mail := outlook.CreateItem(0)

    mail.To := "prakhar.chaurasiya@highbartech.com;"
    mail.Cc := CCList ";"
    mail.Subject := "Request for Approval and Import of TR(s)"

    mail.Display()

    if WinExist("ahk_class rctrl_renwnd32") {
        WinActivate
        WinWaitActive("ahk_class rctrl_renwnd32", , 2)
    }

    ; Remove default Outlook signature

    Send "{Delete}"
    Send "{Delete}"

    Sleep 1500

    ; Remove default Outlook signature
    ; FileAppend(mail.HTMLBody,"mail.txt")
    mail.HTMLBody :=
    (
            "<span style='font-family:Trebuchet MS; font-size:11pt;'>"
            . "<p>Dear Prakhar,</p>"
            . "<p>Please import the below transport request(s) to both quality & production systems, "
            . "subject to Ketan's approval.</p>"
            . TRHtml
            . "<p>Kindly proceed once approved.</p>"
            . "</span>"
            . mail.HTMLBody
        )
        
    ; -----------------------------
    ; Clear TR file after mail
    ; -----------------------------
    FileDelete filePath
    FileAppend "", filePath
}

; ---------------------------------------------------
; Right Ctrl + M → Generate Mail (from TRs.txt)
; ---------------------------------------------------
; >^m::
; {
;     filePath := A_ScriptDir "\TRs.txt"

;     if !FileExist(filePath) {
;         MsgBox "TR file not found!"
;         return
;     }

;     content := FileRead(filePath)
;     if (content = "") {
;         MsgBox "TR file is empty!"
;         return
;     }

;     lines := StrSplit(content, ["`r", "`n"])

;     ; Build HTML list directly from file content
;     TRHtml := "<ul>"
;     for line in lines {
;         line := Trim(line)
;         if (line != "")
;             TRHtml .= "<li>" line "</li>`n"
;     }
;     TRHtml .= "</ul>"

;     outlook := ComObject("Outlook.Application")
;     mail := outlook.CreateItem(0)

;     mail.To := "prakhar.chaurasiya@highbartech.com;"
;     mail.Cc := "ketan.deshpande@highbartech.com;"
;     mail.Subject := "Request for Approval and Import of TR(s)"

;     mail.Display()

;     ; Remove default Outlook signature lines
;     Send "{Delete}"

;     Sleep 1000

;     mail.HTMLBody :=
;         (
;             "<span style='font-family:Trebuchet MS; font-size:11pt;'>"
;             . "<p>Dear Prakhar,</p>"
;             . "<p>Please import the below transport request(s) to both quality & production systems, "
;             . "subject to Ketan's approval.</p>"
;             . TRHtml
;             . "<span>Kindly proceed once approved.</span>"
;             . "</span>"
;             . mail.HTMLBody
;         )

;     ; Clear file after mail generation
;     FileDelete filePath
;     FileAppend "", filePath   ; recreate empty file

;     ; MsgBox("Mail prepared successfully!", "Success", "T0.5")
; }
