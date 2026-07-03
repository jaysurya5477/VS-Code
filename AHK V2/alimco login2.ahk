#Requires AutoHotkey v2.0
#SingleInstance Force
SendMode("Input")
SetWorkingDir(A_ScriptDir)
CoordMode("Pixel", "Window")

; MsgBox("Started", "Reload", "T0.5")

; F5:: Reload()

#F1:: {
    Sleep(500)
    SetKeyDelay(20, 20)
    SendText("HBTADMIN")
    Send("{Tab}")
    Sleep(500)
    SendText("Abap@Hbt!@#$%987654")
    Sleep(500)
    Send("{Enter}")
}

#F4:: {
    Sleep(500)
    SetKeyDelay(20, 20)
    Send("+{Tab}")
    SendText("120")
    Send("{Tab}")
    SendText("HBTABAP")
    Sleep(500)
    Send("{Tab}")
    SendText("HgAlimco#$%67890")
    Sleep(500)
    Send("{Enter}")
}

#F2:: {
    Sleep(500)
    SetKeyDelay(20, 20)
    SendText("HBTADMIN")
    Send("{Tab}")
    Sleep(500)
    SendText("Abap@Hbt!@#$%987654")
    Sleep(500)
    Send("{Enter}")
}

#F3:: {
    Sleep(500)
    SetKeyDelay(20, 20)
    SendText("HBTADMIN")
    Send("{Tab}")
    Sleep(500)
    SendText("Abap@Hbt!@#$%987654")
    Sleep(500)
    Send("{Enter}")
}

^!Esc::{
    MsgBox("Exiting...", "Exit", "T0.5")
    ExitApp()
}


^0::
{
    currentDate := FormatTime(A_Now, "dd.MM.yyyy")
    SendText(": JS : " . currentDate)
}