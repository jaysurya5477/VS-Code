; AutoHotkey V2 - ABAP Code Change Comment Generator
; Purpose: Quickly generate ABAP code change comments with current date

#Requires AutoHotkey v2.0

; Global variables for comment template
global authorName := "Jayasurya Lakkoju"
global featureDescription := " "           ;Enter Description here

; Function to get current date in DD.MM.YYYY format
GetCurrentDate() {
    return FormatTime(A_Now, "dd.MM.yyyy")
}

; Function to generate Start comment
GenerateStartComment() {
    currentDate := GetCurrentDate()
    return "** Start: " featureDescription " -------by " authorName " : " currentDate
}

; Function to generate End comment
GenerateEndComment() {
    currentDate := GetCurrentDate()
    return "** End: " featureDescription " -------by " authorName " : " currentDate
}

; Hotkey: Ctrl+Alt+S to paste Start comment
^9:: {
    startComment := GenerateStartComment()
    endComment := GenerateEndComment()
    fullComment := startComment "`n`n** (Your code here)`n`n" endComment
    Send(fullComment)
}

; Display tooltip on startup
ToolTip "ABAP Comment Generator Active for Ctrl+9"
SetTimer(() => ToolTip(), 3000)
