#Requires AutoHotkey v2.0
#SingleInstance Force


if A_Args.Length = 0 {
    ExitApp(1)
}

hwnd := A_Args[1]

if !hwnd {
    ExitApp(2)
}

WinActivate("ahk_exe saplogon.exe")
WinActivate("ahk_class SAP_FRONTEND_SESSION")

fg := DllCall("GetForegroundWindow", "ptr")

; Attach input queues
DllCall("AttachThreadInput"
    , "uint", DllCall("GetWindowThreadProcessId", "ptr", fg, "uint*", 0)
    , "uint", DllCall("GetWindowThreadProcessId", "ptr", hwnd, "uint*", 0)
    , "int",  true)

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
    , "int",  false)

ExitApp(0)

; IsWindowOnTop(hwnd) {
;     target := DllCall("GetAncestor", "ptr", hwnd, "uint", 2, "ptr") ; GA_ROOT

;     ; Allocate memory to store HWND result
;     buf := Buffer(A_PtrSize, 0)

;     cb := CallbackCreate(EnumProc)
;     DllCall("EnumWindows", "ptr", cb, "ptr", buf.Ptr)
;     CallbackFree(cb)

;     top := NumGet(buf, 0, "ptr")
;     if !top
;         return false

;     topRoot := DllCall("GetAncestor", "ptr", top, "uint", 2, "ptr")
;     return topRoot = target

;     EnumProc(hwndEnum, lParam) {
;         ; First visible window in Z-order wins
;         if DllCall("IsWindowVisible", "ptr", hwndEnum) {
;             NumPut("ptr", hwndEnum, lParam)
;             return false ; stop enumeration
;         }
;         return true
;     }
; }