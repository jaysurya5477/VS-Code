#Requires AutoHotkey v2.0
#SingleInstance Force

; Load module-to-owner map from config.ini
global ModuleOwnerMap := Map()
configPath := "D:\New\VS Code\AHK V2\sap_config.ini"

LoadConfig() {
    global ModuleOwnerMap, configPath
    ModuleOwnerMap.Clear()
    if !FileExist(configPath)
        return
    loop read, configPath {
        line := Trim(A_LoopReadLine)
        if (line = "" || SubStr(line, 1, 1) = ";" || SubStr(line, 1, 1) = "[")
            continue
        parts := StrSplit(line, "=", , 2)
        if (parts.Length = 2)
            ModuleOwnerMap[Trim(parts[1])] := Trim(parts[2])   ; << MM -> Anurag
    }
}

GetFunctional(module) {
    global ModuleOwnerMap
    key := Trim(module)
    if (ModuleOwnerMap.Has(key))
        return ModuleOwnerMap[key]   ; << matched
    return ""                        ; << blank if not found
}

; working version with pasting, date detection and debug logging
^+v:: {

    LoadConfig()   ; << reload config fresh on each hotkey press

    clipboardContent := Trim(A_Clipboard, "`r`n")

    if (clipboardContent = "") {
        MsgBox "Clipboard is empty - copy data first with Ctrl+C"
        return
    }

    rows := StrSplit(clipboardContent, "`n", "`r")

    if (rows.Length = 0) {
        MsgBox "No rows found in clipboard"
        return
    }

    debugLog := "=== RAW CLIPBOARD ROWS ===`n"
    for i, r in rows
        debugLog .= "Row[" i "]: [" r "]`n"

    lastDate := ""
    output := ""

    debugLog .= "`n=== PARSED COLUMNS ===`n"

    for index, row in rows {
        row := Trim(row)
        if (row = "")
            continue

        ; -------------------------------------------------------
        ; Split by TAB, then group consecutive empty tabs to find
        ; real content blocks — handles merged date cells
        ; -------------------------------------------------------
        rawCols := StrSplit(row, "`t")

        ; Extract only non-empty values in order → [date?, issue, remarks, module?]
        contentCols := []
        for ci, cv in rawCols {
            trimmed := Trim(cv)
            if (trimmed != "")
                contentCols.Push(trimmed)
        }

        debugLog .= "Row[" index "] RawColCount=" rawCols.Length " ContentCols=" contentCols.Length "`n"
        for ci, cv in contentCols
            debugLog .= "  content[" ci "]=[" cv "]`n"

        ; -------------------------------------------------------
        ; Map content columns to date / issue / remarks
        ; Excel source: date(merged) | issue | remarks
        ;
        ; When date cell is merged and empty on copy:
        ;   contentCols[1] = issue, contentCols[2] = remarks
        ; When date cell has value:
        ;   contentCols[1] = date,  contentCols[2] = issue, contentCols[3] = remarks
        ;
        ; Detect date by checking if first content col looks like a date
        ; -------------------------------------------------------
        date := ""
        issue := ""
        remarks := ""
        module := ""

        if (contentCols.Length >= 1) {
            ; Check if first column is a date (matches dd-Mmm-yy pattern)
            if (contentCols.Length >= 2 && RegExMatch(contentCols[1], "^\d{1,2}-[A-Za-z]{3}-\d{2}$")) {
                ; First col is date
                date := contentCols[1]
                issue := contentCols.Length >= 2 ? contentCols[2] : ""
                remarks := contentCols.Length >= 3 ? contentCols[3] : ""
                module := contentCols.Length >= 4 ? contentCols[4] : ""
            } else {
                ; No date in this row (merged cell) — use carried forward date
                issue := contentCols[1]
                remarks := contentCols.Length >= 2 ? contentCols[2] : ""
                module := contentCols.Length >= 3 ? contentCols[3] : ""
            }
        }

        ; Carry forward date for merged cells
        if (date != "")
            lastDate := date
        else
            date := lastDate

        ; Skip rows with no issue
        if (issue = "")
            continue

        functional := GetFunctional(module)   ; << lookup col 15 value

        debugLog .= "  → date=[" date "] issue=[" issue "] remarks=[" remarks "] module=[" module "]`n"

        ; -------------------------------------------------------
        ; OUTPUT: 19 columns
        ; 1-5   : empty (manual entry)
        ; 6     : issue
        ; 7,8,9 : date
        ; 10,11 : skip
        ; 12,13 : date
        ; 14,15 : skip
        ; 16    : "Jayasurya Lakkoju"
        ; 17    : skip
        ; 18    : "Completed"
        ; 19    : remarks
        ; -------------------------------------------------------
        newRow :=
            ;  "`t"                       ; col 1  manual
              module . "`t"               ; col 2  manual
            . "`t"                        ; col 3  manual
            . "`t"                        ; col 4  manual
            . "`t"                        ; col 5  manual
            . issue . "`t"                ; col 6  issue
            . date . "`t"                 ; col 7  date
            . date . "`t"                 ; col 8  date
            . date . "`t"                 ; col 9  date
            . "`t"                        ; col 10 skip
            . "`t"                        ; col 11 skip
            . date . "`t"                 ; col 12 date
            . date . "`t"                 ; col 13 date
            . "`t"                        ; col 14 skip
            . functional . "`t"           ; col 15 Functional
            . "Jayasurya Lakkoju`t"       ; col 16 Technical
            . "`t"                        ; col 17 skip
            . "Completed`t"               ; col 18 status
            . remarks                     ; col 19 remarks

        output .= newRow . "`r`n"
    }

    ; Write debug log
    debugLog .= "`n=== OUTPUT ===`n" . output
    FileDelete "D:\New\VS Code\AHK V2\debug_output.txt"
    FileAppend debugLog, "D:\New\VS Code\AHK V2\debug_output.txt"

    if (output = "") {
        MsgBox "No valid rows to paste. Check D:\New\VS Code\AHK V2\debug_output.txt for details."
        return
    }

    A_Clipboard := RTrim(output, "`r`n")
    ClipWait 1
    Send "^v"
}
; ```

; **Key logic change — date detection instead of fixed positions:**
; ```
; If col[1] matches date pattern (dd-Mmm-yy)  →  date | issue | remarks
; If col[1] does NOT match date pattern        →  issue | remarks  (date carried forward)

; working version with sending keystrokes directly (no pasting, no date detection, no debug logging)
; ^9:: {
;     clipboardContent := Trim(A_Clipboard, "`r`n")

;     if (clipboardContent = "") {
;         MsgBox "Clipboard is empty - copy data first with Ctrl+C"
;         return
;     }

;     rows := StrSplit(clipboardContent, "`n", "`r")

;     if (rows.Length = 0) {
;         MsgBox "No rows found in clipboard"
;         return
;     }

;     lastDate := ""
;     parsedRows := []

;     for index, row in rows
;     {
;         row := Trim(row)
;         if (row = "")
;             continue

;         rawCols := StrSplit(row, "`t")

;         ; Extract only non-empty values
;         contentCols := []
;         for ci, cv in rawCols {
;             trimmed := Trim(cv)
;             if (trimmed != "")
;                 contentCols.Push(trimmed)
;         }

;         date    := ""
;         issue   := ""
;         remarks := ""

;         if (contentCols.Length >= 1) {
;             if (contentCols.Length >= 2 && RegExMatch(contentCols[1], "^\d{1,2}-[A-Za-z]{3}-\d{2}$")) {
;                 date    := contentCols[1]
;                 issue   := contentCols.Length >= 2 ? contentCols[2] : ""
;                 remarks := contentCols.Length >= 3 ? contentCols[3] : ""
;             } else {
;                 issue   := contentCols[1]
;                 remarks := contentCols.Length >= 2 ? contentCols[2] : ""
;             }
;         }

;         if (date != "")
;             lastDate := date
;         else
;             date := lastDate

;         if (issue = "")
;             continue

;         parsedRows.Push({date: date, issue: issue, remarks: remarks})
;     }

;     if (parsedRows.Length = 0) {
;         MsgBox "No valid rows found."
;         return
;     }

;     ; -------------------------------------------------------
;     ; Send each row directly via keystrokes
;     ; Col 1-5  : Tab only (manual columns - skip over them)
;     ; Col 6    : issue
;     ; Col 7,8,9: date
;     ; Col 10,11: Tab only (skip)
;     ; Col 12,13: date
;     ; Col 14,15: Tab only (skip)
;     ; Col 16   : "Jayasurya Lakkoju"
;     ; Col 17   : Tab only (skip)
;     ; Col 18   : "Completed"
;     ; Col 19   : remarks → Enter to go next row
;     ; -------------------------------------------------------
;     for index, r in parsedRows
;     {
;         ; Send "{Tab}"                              ; col 1 skip
;         ; Send "{Tab}"                              ; col 2 skip
;         ; Send "{Tab}"                              ; col 3 skip
;         ; Send "{Tab}"                              ; col 4 skip
;         ; Send "{Tab}"                              ; col 5 skip
;         SendText r.issue                          ; col 6 issue
;         Send "{Tab}"
;         SendText r.date                           ; col 7 date
;         Send "{Tab}"
;         SendText r.date                           ; col 8 date
;         Send "{Tab}"
;         SendText r.date                           ; col 9 date
;         Send "{Tab}"
;         Send "{Tab}"                              ; col 10 skip
;         Send "{Tab}"                              ; col 11 skip
;         SendText r.date                           ; col 12 date
;         Send "{Tab}"
;         SendText r.date                           ; col 13 date
;         Send "{Tab}"
;         Send "{Tab}"                              ; col 14 skip
;         Send "{Tab}"                              ; col 15 skip
;         SendText "Jayasurya Lakkoju"              ; col 16 name
;         Send "{Tab}"
;         Send "{Tab}"                              ; col 17 skip
;         SendText "Completed"                      ; col 18 status
;         Send "{Tab}"
;         SendText r.remarks                        ; col 19 remarks
;         Send "{Enter}"                            ; next row
;     }
; }
