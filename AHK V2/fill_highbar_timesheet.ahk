#Requires AutoHotkey v2.0.18+
#SingleInstance Force
SetWorkingDir A_ScriptDir  ; Ensure the script runs in its own directory

; --- Declare global variable properly ---
global pyPID
pyPID := 0

^!t::  ; Ctrl + Alt + T
{
    ; --- Change this to your tracker window title ---
    trackerTitle := "Daily Work Book.xlsx"   ; partial match works

    ; --- Check if tracker (Chrome app) is OPEN ---
    if WinExist(trackerTitle " ahk_exe chrome.exe") {
        ; --- Run Python Script ---
        ; Update paths accordingly
        ; pythonPath := "C:\Users\Jayasurya Lakkoju\AppData\Local\Programs\Python\Python314\python.exe"
        pythonPath := "python"
        scriptPath := "D:\New\VS Code\Python\Fill_OneHr_Highbar_timesheet\Project File\main.py"
                    
        Run '"' pythonPath '" "' scriptPath '"'

        ; --- Optional confirmation ---
        TrayTip "Timesheet Automation", "Python script started...", 3

    }
    else {
        MsgBox "Please open the Timesheet tracker (Chrome app) first.", "Error", "IconX"
    }

}

; --- ESC to kill Python script ---
Esc::
{
    global pyPID

    if (pyPID)
    {
        ProcessClose pyPID
        TrayTip "Timesheet Automation", "Python process stopped!", 2
        pyPID := 0
    }
}