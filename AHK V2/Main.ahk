#Requires AutoHotkey v2.0.18+
#SingleInstance Force

MsgBox("Started", "Reload", "T0.5")
^F5:: Reload()

#Include alimco login2.ahk
#Include sap_gui_login.ahk
#Include SendTRMail.ahk
#Include tracker.ahk
#Include abap_comment_generator.ahk
#Include fill_highbar_timesheet.ahk
