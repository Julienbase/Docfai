#include <napi.h>
#include <windows.h>
#include <UIAutomation.h>
#include <thread>
#include <atomic>
#include <string>
#include <map>
#include <queue>
#include <cmath>

#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "ole32.lib")

// ============================================================================
// Auto-Click Capture Module (Hook-Based)
//
// Detects global mouse clicks via SetWindowsHookEx(WH_MOUSE_LL) — the
// standard low-level mouse hook used by legitimate accessibility and screen
// capture tools (OBS, Camtasia, Snagit, etc.).
//
// Every click is captured immediately with zero delay (industry standard).
// Queries Windows UI Automation to identify clicked elements.
// Emits click events with element info to JavaScript via ThreadSafeFunction.
// ============================================================================

// Custom message for deferred click processing on the hook thread
#define WM_PROCESS_CLICK (WM_APP + 1)

// --- Global state ---
static std::atomic<bool> g_running(false);
static std::thread g_hookThread;
static Napi::ThreadSafeFunction g_tsfn;
static HWND g_targetWindow = NULL;  // NULL = entire screen (capture all)
static int g_debounceMs = 300;
static bool g_captureRightClicks = true;

// Hook state
static HHOOK g_mouseHook = NULL;
static DWORD g_hookThreadId = 0;
static HANDLE g_threadReadyEvent = NULL;

// --- Debounce state (hook thread only) ---
static ULONGLONG g_lastLeftClickTime = 0;
static POINT g_lastLeftClickPos = { 0, 0 };
static ULONGLONG g_lastRightClickTime = 0;
static POINT g_lastRightClickPos = { 0, 0 };
static const int POSITION_TOLERANCE_PX = 5;

// Click queue (hook proc -> message handler, same thread — no sync needed)
struct QueuedClick {
    POINT pt;
    bool isRightClick;
    ULONGLONG timestamp;
};
static std::queue<QueuedClick> g_clickQueue;

// --- Control type name mapping ---
static const std::map<CONTROLTYPEID, std::string> g_controlTypeNames = {
    { UIA_ButtonControlTypeId, "button" },
    { UIA_CalendarControlTypeId, "calendar" },
    { UIA_CheckBoxControlTypeId, "checkbox" },
    { UIA_ComboBoxControlTypeId, "dropdown" },
    { UIA_EditControlTypeId, "text box" },
    { UIA_HyperlinkControlTypeId, "link" },
    { UIA_ImageControlTypeId, "image" },
    { UIA_ListItemControlTypeId, "list item" },
    { UIA_ListControlTypeId, "list" },
    { UIA_MenuControlTypeId, "menu" },
    { UIA_MenuBarControlTypeId, "menu bar" },
    { UIA_MenuItemControlTypeId, "menu item" },
    { UIA_ProgressBarControlTypeId, "progress bar" },
    { UIA_RadioButtonControlTypeId, "radio button" },
    { UIA_ScrollBarControlTypeId, "scrollbar" },
    { UIA_SliderControlTypeId, "slider" },
    { UIA_SpinnerControlTypeId, "spinner" },
    { UIA_StatusBarControlTypeId, "status bar" },
    { UIA_TabControlTypeId, "tab bar" },
    { UIA_TabItemControlTypeId, "tab" },
    { UIA_TextControlTypeId, "text" },
    { UIA_ToolBarControlTypeId, "toolbar" },
    { UIA_ToolTipControlTypeId, "tooltip" },
    { UIA_TreeControlTypeId, "tree" },
    { UIA_TreeItemControlTypeId, "tree item" },
    { UIA_WindowControlTypeId, "window" },
    { UIA_PaneControlTypeId, "pane" },
    { UIA_GroupControlTypeId, "group" },
    { UIA_ThumbControlTypeId, "thumb" },
    { UIA_DataGridControlTypeId, "data grid" },
    { UIA_DataItemControlTypeId, "data item" },
    { UIA_DocumentControlTypeId, "document" },
    { UIA_SplitButtonControlTypeId, "split button" },
    { UIA_HeaderControlTypeId, "header" },
    { UIA_HeaderItemControlTypeId, "header item" },
    { UIA_TableControlTypeId, "table" },
    { UIA_TitleBarControlTypeId, "title bar" },
    { UIA_SeparatorControlTypeId, "separator" },
};

// --- Helper: BSTR to std::string (UTF-8) ---
static std::string BstrToString(BSTR bstr) {
    if (!bstr || SysStringLen(bstr) == 0) return "";
    int len = WideCharToMultiByte(CP_UTF8, 0, bstr, -1, NULL, 0, NULL, NULL);
    if (len <= 0) return "";
    std::string result(len - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, bstr, -1, &result[0], len, NULL, NULL);
    return result;
}

// --- Helper: get control type name ---
static std::string GetControlTypeName(CONTROLTYPEID typeId) {
    auto it = g_controlTypeNames.find(typeId);
    if (it != g_controlTypeNames.end()) return it->second;
    return "element";
}

// --- Helper: check if position is within tolerance ---
static bool IsSamePosition(POINT a, POINT b) {
    return std::abs(a.x - b.x) <= POSITION_TOLERANCE_PX &&
           std::abs(a.y - b.y) <= POSITION_TOLERANCE_PX;
}

// --- Data structure passed to JS callback ---
struct ClickEventData {
    int clickX;
    int clickY;
    std::string clickType;  // "click", "rightclick"
    double timestamp;
    // Element info
    std::string elementName;
    std::string controlType;
    CONTROLTYPEID controlTypeId;
    std::string className;
    std::string automationId;
    RECT boundingRect;
    bool hasBoundingRect;
    bool hasElementInfo;
};

// --- Query UI Automation for element at point ---
static void QueryElementAtPoint(IUIAutomation* pAutomation, POINT pt, ClickEventData& data) {
    data.hasElementInfo = false;
    data.hasBoundingRect = false;

    if (!pAutomation) return;

    IUIAutomationElement* pElement = nullptr;
    HRESULT hr = pAutomation->ElementFromPoint(pt, &pElement);

    if (FAILED(hr) || !pElement) return;

    data.hasElementInfo = true;

    // Name
    BSTR name = nullptr;
    if (SUCCEEDED(pElement->get_CurrentName(&name)) && name) {
        data.elementName = BstrToString(name);
        SysFreeString(name);
    }

    // Control type
    CONTROLTYPEID controlType = 0;
    if (SUCCEEDED(pElement->get_CurrentControlType(&controlType))) {
        data.controlTypeId = controlType;
        data.controlType = GetControlTypeName(controlType);
    }

    // Class name
    BSTR className = nullptr;
    if (SUCCEEDED(pElement->get_CurrentClassName(&className)) && className) {
        data.className = BstrToString(className);
        SysFreeString(className);
    }

    // Automation ID
    BSTR automationId = nullptr;
    if (SUCCEEDED(pElement->get_CurrentAutomationId(&automationId)) && automationId) {
        data.automationId = BstrToString(automationId);
        SysFreeString(automationId);
    }

    // Bounding rectangle
    RECT rect = { 0 };
    if (SUCCEEDED(pElement->get_CurrentBoundingRectangle(&rect))) {
        data.boundingRect = rect;
        data.hasBoundingRect = true;
    }

    pElement->Release();
}

// --- Emit click event to JavaScript ---
static void EmitClickEvent(const ClickEventData& data) {
    if (!g_running) return;

    auto eventCopy = new ClickEventData(data);

    auto status = g_tsfn.NonBlockingCall(eventCopy, [](Napi::Env env, Napi::Function jsCallback, ClickEventData* event) {
        if (!event) return;

        Napi::Object result = Napi::Object::New(env);
        result.Set("clickX", Napi::Number::New(env, event->clickX));
        result.Set("clickY", Napi::Number::New(env, event->clickY));
        result.Set("clickType", Napi::String::New(env, event->clickType));
        result.Set("timestamp", Napi::Number::New(env, event->timestamp));

        // Element info
        Napi::Object element = Napi::Object::New(env);
        if (event->hasElementInfo) {
            if (!event->elementName.empty()) {
                element.Set("name", Napi::String::New(env, event->elementName));
            } else {
                element.Set("name", env.Null());
            }
            element.Set("controlType", Napi::String::New(env, event->controlType));
            element.Set("controlTypeId", Napi::Number::New(env, event->controlTypeId));
            if (!event->className.empty()) {
                element.Set("className", Napi::String::New(env, event->className));
            } else {
                element.Set("className", env.Null());
            }
            if (!event->automationId.empty()) {
                element.Set("automationId", Napi::String::New(env, event->automationId));
            } else {
                element.Set("automationId", env.Null());
            }
            if (event->hasBoundingRect) {
                Napi::Object rect = Napi::Object::New(env);
                rect.Set("left", Napi::Number::New(env, event->boundingRect.left));
                rect.Set("top", Napi::Number::New(env, event->boundingRect.top));
                rect.Set("right", Napi::Number::New(env, event->boundingRect.right));
                rect.Set("bottom", Napi::Number::New(env, event->boundingRect.bottom));
                element.Set("boundingRect", rect);
            } else {
                element.Set("boundingRect", env.Null());
            }
        } else {
            element.Set("name", env.Null());
            element.Set("controlType", Napi::String::New(env, "element"));
            element.Set("controlTypeId", Napi::Number::New(env, 0));
            element.Set("className", env.Null());
            element.Set("automationId", env.Null());
            element.Set("boundingRect", env.Null());
        }
        result.Set("element", element);

        jsCallback.Call({ result });
        delete event;
    });

    if (status != napi_ok) {
        delete eventCopy;
    }
}

// --- Process a queued click event (runs on hook thread) ---
// Every click is captured immediately — no pending state, no delay.
static void ProcessClick(IUIAutomation* pAutomation, const QueuedClick& click) {
    ULONGLONG now = click.timestamp;
    POINT cursorPos = click.pt;

    if (click.isRightClick) {
        // Source filtering
        if (g_targetWindow != NULL) {
            HWND foreground = GetForegroundWindow();
            if (foreground != g_targetWindow) return;
        }

        // Debounce: skip if same position within debounce interval
        if ((now - g_lastRightClickTime) < (ULONGLONG)g_debounceMs &&
            IsSamePosition(cursorPos, g_lastRightClickPos)) {
            return;
        }

        g_lastRightClickTime = now;
        g_lastRightClickPos = cursorPos;

        ClickEventData data = {};
        data.clickX = cursorPos.x;
        data.clickY = cursorPos.y;
        data.clickType = "rightclick";
        data.timestamp = (double)now;

        QueryElementAtPoint(pAutomation, cursorPos, data);
        EmitClickEvent(data);
    } else {
        // Source filtering
        if (g_targetWindow != NULL) {
            HWND foreground = GetForegroundWindow();
            if (foreground != g_targetWindow) return;
        }

        // Debounce: skip if same position within debounce interval
        if ((now - g_lastLeftClickTime) < (ULONGLONG)g_debounceMs &&
            IsSamePosition(cursorPos, g_lastLeftClickPos)) {
            return;
        }

        g_lastLeftClickTime = now;
        g_lastLeftClickPos = cursorPos;

        ClickEventData data = {};
        data.clickX = cursorPos.x;
        data.clickY = cursorPos.y;
        data.clickType = "click";
        data.timestamp = (double)now;

        QueryElementAtPoint(pAutomation, cursorPos, data);
        EmitClickEvent(data);
    }
}

// --- Low-level mouse hook callback ---
// Called on the hook thread when mouse input occurs system-wide.
// Must be fast — heavy work is deferred to the message handler.
static LRESULT CALLBACK LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode >= 0 && g_running) {
        bool isLeftDown = (wParam == WM_LBUTTONDOWN);
        bool isRightDown = (wParam == WM_RBUTTONDOWN) && g_captureRightClicks;

        if (isLeftDown || isRightDown) {
            MSLLHOOKSTRUCT* mhs = (MSLLHOOKSTRUCT*)lParam;

            QueuedClick click;
            click.pt = mhs->pt;
            click.isRightClick = isRightDown;
            click.timestamp = GetTickCount64();

            g_clickQueue.push(click);
            PostThreadMessage(g_hookThreadId, WM_PROCESS_CLICK, 0, 0);
        }
    }

    return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
}

// --- Hook thread function ---
static void HookThreadFunc() {
    g_hookThreadId = GetCurrentThreadId();

    // Initialize COM (required for UIAutomation)
    HRESULT hrCom = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(hrCom)) {
        hrCom = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    }

    // Create UIAutomation instance
    IUIAutomation* pAutomation = nullptr;
    HRESULT hrUia = CoCreateInstance(
        __uuidof(CUIAutomation), NULL, CLSCTX_INPROC_SERVER,
        __uuidof(IUIAutomation), (void**)&pAutomation
    );

    if (FAILED(hrUia)) {
        pAutomation = nullptr;
    }

    // Install the low-level mouse hook
    g_mouseHook = SetWindowsHookEx(WH_MOUSE_LL, LowLevelMouseProc, GetModuleHandle(NULL), 0);

    if (!g_mouseHook) {
        g_running = false;
        if (g_threadReadyEvent) SetEvent(g_threadReadyEvent);
        if (pAutomation) { pAutomation->Release(); }
        if (SUCCEEDED(hrCom)) { CoUninitialize(); }
        g_hookThreadId = 0;
        return;
    }

    // Signal that the thread is ready
    if (g_threadReadyEvent) {
        SetEvent(g_threadReadyEvent);
    }

    // Message pump — required for WH_MOUSE_LL to receive callbacks
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0) > 0) {
        if (msg.message == WM_PROCESS_CLICK) {
            while (!g_clickQueue.empty()) {
                QueuedClick click = g_clickQueue.front();
                g_clickQueue.pop();
                ProcessClick(pAutomation, click);
            }
        } else {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
    }

    // --- Cleanup ---
    if (g_mouseHook) {
        UnhookWindowsHookEx(g_mouseHook);
        g_mouseHook = NULL;
    }

    while (!g_clickQueue.empty()) {
        g_clickQueue.pop();
    }

    if (pAutomation) {
        pAutomation->Release();
        pAutomation = nullptr;
    }

    if (SUCCEEDED(hrCom)) {
        CoUninitialize();
    }

    g_hookThreadId = 0;
}

// ============================================================================
// NAPI Exports
// ============================================================================

Napi::Value StartClickDetection(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_running) {
        Napi::Error::New(env, "Click detection is already running").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected callback function as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Parse options
    if (info.Length() >= 2 && info[1].IsObject()) {
        Napi::Object opts = info[1].As<Napi::Object>();
        // pollIntervalMs is accepted but ignored (hook-based, no polling)
        if (opts.Has("debounceMs") && opts.Get("debounceMs").IsNumber()) {
            g_debounceMs = opts.Get("debounceMs").As<Napi::Number>().Int32Value();
            if (g_debounceMs < 50) g_debounceMs = 50;
            if (g_debounceMs > 2000) g_debounceMs = 2000;
        }
        if (opts.Has("captureRightClicks") && opts.Get("captureRightClicks").IsBoolean()) {
            g_captureRightClicks = opts.Get("captureRightClicks").As<Napi::Boolean>().Value();
        }
    }

    // Reset debounce state
    g_lastLeftClickTime = 0;
    g_lastLeftClickPos = { 0, 0 };
    g_lastRightClickTime = 0;
    g_lastRightClickPos = { 0, 0 };

    // Create ThreadSafeFunction
    g_tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "AutoClickCapture",
        0,    // Unlimited queue
        1     // 1 thread
    );

    g_running = true;

    g_threadReadyEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
    g_hookThread = std::thread(HookThreadFunc);

    if (g_threadReadyEvent) {
        WaitForSingleObject(g_threadReadyEvent, 5000);
        CloseHandle(g_threadReadyEvent);
        g_threadReadyEvent = NULL;
    }

    if (!g_running) {
        if (g_hookThread.joinable()) {
            g_hookThread.join();
        }
        g_tsfn.Abort();
        Napi::Error::New(env, "Failed to install mouse hook").ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value StopClickDetection(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!g_running) {
        return Napi::Boolean::New(env, false);
    }

    g_running = false;

    if (g_hookThreadId != 0) {
        PostThreadMessage(g_hookThreadId, WM_QUIT, 0, 0);
    }

    g_tsfn.Abort();

    // Join the thread — after WM_QUIT the hook thread exits within milliseconds.
    // join() prevents race conditions if StartClickDetection is called again
    // quickly (two threads competing for global state).
    if (g_hookThread.joinable()) {
        g_hookThread.join();
    }

    g_targetWindow = NULL;

    return Napi::Boolean::New(env, true);
}

Napi::Value SetTargetWindow(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || info[0].IsNull() || info[0].IsUndefined()) {
        g_targetWindow = NULL;
    } else if (info[0].IsNumber()) {
        HWND hwnd = (HWND)(uintptr_t)info[0].As<Napi::Number>().Int64Value();
        // Validate the window handle before accepting it
        g_targetWindow = (hwnd && IsWindow(hwnd)) ? hwnd : NULL;
    } else {
        g_targetWindow = NULL;
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value GetElementInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected x and y coordinates").ThrowAsJavaScriptException();
        return env.Null();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();

    HRESULT hrCom = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    IUIAutomation* pAutomation = nullptr;
    HRESULT hrUia = CoCreateInstance(
        __uuidof(CUIAutomation), NULL, CLSCTX_INPROC_SERVER,
        __uuidof(IUIAutomation), (void**)&pAutomation
    );

    Napi::Object result = Napi::Object::New(env);

    if (SUCCEEDED(hrUia) && pAutomation) {
        POINT pt = { x, y };
        ClickEventData data = {};
        QueryElementAtPoint(pAutomation, pt, data);

        if (data.hasElementInfo) {
            if (!data.elementName.empty()) {
                result.Set("name", Napi::String::New(env, data.elementName));
            } else {
                result.Set("name", env.Null());
            }
            result.Set("controlType", Napi::String::New(env, data.controlType));
            result.Set("controlTypeId", Napi::Number::New(env, data.controlTypeId));
            if (!data.className.empty()) {
                result.Set("className", Napi::String::New(env, data.className));
            } else {
                result.Set("className", env.Null());
            }
            if (!data.automationId.empty()) {
                result.Set("automationId", Napi::String::New(env, data.automationId));
            } else {
                result.Set("automationId", env.Null());
            }
            if (data.hasBoundingRect) {
                Napi::Object rect = Napi::Object::New(env);
                rect.Set("left", Napi::Number::New(env, data.boundingRect.left));
                rect.Set("top", Napi::Number::New(env, data.boundingRect.top));
                rect.Set("right", Napi::Number::New(env, data.boundingRect.right));
                rect.Set("bottom", Napi::Number::New(env, data.boundingRect.bottom));
                result.Set("boundingRect", rect);
            } else {
                result.Set("boundingRect", env.Null());
            }
        } else {
            result.Set("name", env.Null());
            result.Set("controlType", Napi::String::New(env, "element"));
            result.Set("controlTypeId", Napi::Number::New(env, 0));
            result.Set("className", env.Null());
            result.Set("automationId", env.Null());
            result.Set("boundingRect", env.Null());
        }

        pAutomation->Release();
    } else {
        result.Set("name", env.Null());
        result.Set("controlType", Napi::String::New(env, "element"));
        result.Set("controlTypeId", Napi::Number::New(env, 0));
        result.Set("className", env.Null());
        result.Set("automationId", env.Null());
        result.Set("boundingRect", env.Null());
    }

    if (SUCCEEDED(hrCom)) {
        CoUninitialize();
    }

    return result;
}

Napi::Value IsRunning(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), g_running.load());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startClickDetection"),
                Napi::Function::New(env, StartClickDetection));
    exports.Set(Napi::String::New(env, "stopClickDetection"),
                Napi::Function::New(env, StopClickDetection));
    exports.Set(Napi::String::New(env, "setTargetWindow"),
                Napi::Function::New(env, SetTargetWindow));
    exports.Set(Napi::String::New(env, "getElementInfo"),
                Napi::Function::New(env, GetElementInfo));
    exports.Set(Napi::String::New(env, "isRunning"),
                Napi::Function::New(env, IsRunning));
    return exports;
}

NODE_API_MODULE(auto_click_capture, Init)
