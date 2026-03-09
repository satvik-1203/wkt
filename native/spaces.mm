#import <napi.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>
#include <vector>
#include <string>

// Private CGS types
typedef uint32_t CGSConnectionID;
typedef uint64_t CGSSpaceID;

extern "C" {
  CGSConnectionID CGSMainConnectionID(void);
  CFArrayRef CGSCopyManagedDisplaySpaces(CGSConnectionID cid);
}

// Helper: get all user spaces
static std::vector<std::pair<CGSSpaceID, int>> getUserSpaces() {
  std::vector<std::pair<CGSSpaceID, int>> result;
  CGSConnectionID cid = CGSMainConnectionID();
  CFArrayRef spacesInfo = CGSCopyManagedDisplaySpaces(cid);
  if (!spacesInfo) return result;

  int index = 1;
  CFIndex displayCount = CFArrayGetCount(spacesInfo);
  for (CFIndex d = 0; d < displayCount; d++) {
    CFDictionaryRef display = (CFDictionaryRef)CFArrayGetValueAtIndex(spacesInfo, d);
    CFArrayRef spaces = (CFArrayRef)CFDictionaryGetValue(display, CFSTR("Spaces"));
    if (!spaces) continue;

    CFIndex spaceCount = CFArrayGetCount(spaces);
    for (CFIndex s = 0; s < spaceCount; s++) {
      CFDictionaryRef space = (CFDictionaryRef)CFArrayGetValueAtIndex(spaces, s);

      CFNumberRef id64Ref = (CFNumberRef)CFDictionaryGetValue(space, CFSTR("id64"));
      CFNumberRef typeRef = (CFNumberRef)CFDictionaryGetValue(space, CFSTR("type"));
      if (!id64Ref || !typeRef) continue;

      int64_t id64 = 0;
      int type = 0;
      CFNumberGetValue(id64Ref, kCFNumberSInt64Type, &id64);
      CFNumberGetValue(typeRef, kCFNumberIntType, &type);

      if (type == 0) {
        result.push_back({(CGSSpaceID)id64, index});
        index++;
      }
    }
  }

  CFRelease(spacesInfo);
  return result;
}

// N-API: listSpaces() -> [{id, index, label}]
Napi::Value ListSpaces(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto spaces = getUserSpaces();

  Napi::Array result = Napi::Array::New(env, spaces.size());
  for (size_t i = 0; i < spaces.size(); i++) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("id", Napi::Number::New(env, (double)spaces[i].first));
    obj.Set("index", Napi::Number::New(env, spaces[i].second));
    std::string label = "Desktop " + std::to_string(spaces[i].second);
    obj.Set("label", Napi::String::New(env, label));
    result.Set(i, obj);
  }
  return result;
}

// N-API: isAccessibilityTrusted() -> boolean
Napi::Value IsAccessibilityTrusted(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), AXIsProcessTrusted());
}

// N-API: requestAccessibility() -> boolean
Napi::Value RequestAccessibility(const Napi::CallbackInfo& info) {
  NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
  bool trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
  return Napi::Boolean::New(info.Env(), trusted);
}

// N-API: runAppleScript(script: string) -> {success, result?, error?}
// Runs AppleScript IN-PROCESS using NSAppleScript — inherits Electron's accessibility
Napi::Value RunAppleScript(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);

  if (info.Length() < 1 || !info[0].IsString()) {
    result.Set("success", false);
    result.Set("error", Napi::String::New(env, "Usage: runAppleScript(script)"));
    return result;
  }

  std::string scriptStr = info[0].As<Napi::String>().Utf8Value();
  @autoreleasepool {
    NSString *source = [NSString stringWithUTF8String:scriptStr.c_str()];
    NSAppleScript *script = [[NSAppleScript alloc] initWithSource:source];
    NSDictionary *errorDict = nil;
    NSAppleEventDescriptor *descriptor = [script executeAndReturnError:&errorDict];

    if (descriptor) {
      NSString *output = [descriptor stringValue];
      result.Set("success", true);
      if (output) {
        result.Set("result", Napi::String::New(env, [output UTF8String]));
      }
    } else {
      result.Set("success", false);
      if (errorDict) {
        NSString *errMsg = errorDict[NSAppleScriptErrorMessage];
        if (errMsg) {
          result.Set("error", Napi::String::New(env, [errMsg UTF8String]));
        }
      }
    }
  }
  return result;
}

// N-API: rightClickAt(x, y) - simulate right-click using CGEvent
// Moves mouse to position first, then right-clicks
Napi::Value RightClickAt(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) return Napi::Boolean::New(env, false);

  double x = info[0].As<Napi::Number>().DoubleValue();
  double y = info[1].As<Napi::Number>().DoubleValue();
  CGPoint point = CGPointMake(x, y);

  // First move the mouse to the position
  CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, point, kCGMouseButtonLeft);
  if (move) {
    CGEventPost(kCGHIDEventTap, move);
    CFRelease(move);
    usleep(100000); // 100ms settle time
  }

  // Then right-click
  CGEventRef mouseDown = CGEventCreateMouseEvent(NULL, kCGEventRightMouseDown, point, kCGMouseButtonRight);
  CGEventRef mouseUp = CGEventCreateMouseEvent(NULL, kCGEventRightMouseUp, point, kCGMouseButtonRight);

  if (mouseDown && mouseUp) {
    CGEventPost(kCGHIDEventTap, mouseDown);
    usleep(100000); // 100ms hold
    CGEventPost(kCGHIDEventTap, mouseUp);
    CFRelease(mouseDown);
    CFRelease(mouseUp);
    return Napi::Boolean::New(env, true);
  }

  if (mouseDown) CFRelease(mouseDown);
  if (mouseUp) CFRelease(mouseUp);
  return Napi::Boolean::New(env, false);
}

// N-API: pressKey(keyCode) - simulate key press
Napi::Value PressKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1) return Napi::Boolean::New(env, false);

  CGKeyCode keyCode = (CGKeyCode)info[0].As<Napi::Number>().Uint32Value();

  CGEventRef keyDown = CGEventCreateKeyboardEvent(NULL, keyCode, true);
  CGEventRef keyUp = CGEventCreateKeyboardEvent(NULL, keyCode, false);

  if (keyDown && keyUp) {
    CGEventPost(kCGHIDEventTap, keyDown);
    usleep(30000);
    CGEventPost(kCGHIDEventTap, keyUp);
    CFRelease(keyDown);
    CFRelease(keyUp);
    return Napi::Boolean::New(env, true);
  }

  if (keyDown) CFRelease(keyDown);
  if (keyUp) CFRelease(keyUp);
  return Napi::Boolean::New(env, false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("listSpaces", Napi::Function::New(env, ListSpaces));
  exports.Set("isAccessibilityTrusted", Napi::Function::New(env, IsAccessibilityTrusted));
  exports.Set("requestAccessibility", Napi::Function::New(env, RequestAccessibility));
  exports.Set("runAppleScript", Napi::Function::New(env, RunAppleScript));
  exports.Set("rightClickAt", Napi::Function::New(env, RightClickAt));
  exports.Set("pressKey", Napi::Function::New(env, PressKey));
  return exports;
}

NODE_API_MODULE(spaces, Init)
