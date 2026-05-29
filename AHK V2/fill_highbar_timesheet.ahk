#Requires AutoHotkey v2.0.18+
#SingleInstance Force
SetWorkingDir A_ScriptDir  ; Ensure the script runs in its own directory

; --- Declare global variable properly ---
global pyPID
pyPID := 0

^!t::  ; Ctrl + Alt + T
{

    global pyPID
    ; --- Change this to your tracker window title ---
    trackerTitle := "Daily Work Book.xlsx"   ; partial match works

    ; --- Check if tracker (Chrome app) is OPEN ---
    if WinExist(trackerTitle " ahk_exe chrome.exe") {
        ; --- Run Python Script ---
        ; Update paths accordingly
        ; pythonPath := "C:\Users\Jayasurya Lakkoju\AppData\Local\Programs\Python\Python314\python.exe"
        pythonPath := "python"
        scriptPath := "D:\New\VS Code\Python\Fill_OneHr_Highbar_timesheet\Project File\main.py"

        Run('"' pythonPath '" "' scriptPath '"', , , &pyPID)

        ; --- Optional confirmation ---
        TrayTip "Timesheet Automation", "Python script started...", 1

    }
    else {
        MsgBox "Please open the Timesheet tracker (Chrome app) first.", "Error", "IconX"
    }

}

^!a::  ; Ctrl + Alt + A
{
    global pyPID

    pythonPath := "python"
    scriptPath := "D:\New\VS Code\Python\Fill_OneHr_Tasks\Project FIle\main.py"

    Run('"' pythonPath '" "' scriptPath '"', , , &pyPID)

    ; --- Optional confirmation ---
    TrayTip "ABAP Task Automation", "Python script started...", 1

}

; --- ESC to kill Python script ---
^Esc::
{
    global pyPID
    if pyPID and ProcessExist(pyPID) {
        try {
            ProcessClose pyPID
            TrayTip("Python", "Script killed." pyPID, 2)
        } catch {
            TrayTip("Python", "Failed to kill script." pyPID, 2)
        }
    } else {
        TrayTip("Python", "No script running on " pyPID, 2)
        return
    }

    pyPID := 0
}
