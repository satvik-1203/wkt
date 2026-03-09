import Foundation
import CoreGraphics

// MARK: - Private CGS API declarations

typealias CGSConnectionID = UInt32
typealias CGSSpaceID = UInt64

@_silgen_name("CGSMainConnectionID")
func CGSMainConnectionID() -> CGSConnectionID

@_silgen_name("CGSCopyManagedDisplaySpaces")
func CGSCopyManagedDisplaySpaces(_ cid: CGSConnectionID) -> CFArray

@_silgen_name("CGSMoveWindowsToManagedSpace")
func CGSMoveWindowsToManagedSpace(_ cid: CGSConnectionID, _ windowIDs: CFArray, _ spaceID: CGSSpaceID)

@_silgen_name("CGSGetActiveSpace")
func CGSGetActiveSpace(_ cid: CGSConnectionID) -> CGSSpaceID

@_silgen_name("CGSManagedDisplaySetCurrentSpace")
func CGSManagedDisplaySetCurrentSpace(_ cid: CGSConnectionID, _ displayUUID: CFString, _ spaceID: CGSSpaceID)

@_silgen_name("CGSCopyManagedDisplayForSpace")
func CGSCopyManagedDisplayForSpace(_ cid: CGSConnectionID, _ spaceID: CGSSpaceID) -> CFString

// MARK: - SkyLight dynamic loading for space creation

typealias SLSSpaceCreateFunc = @convention(c) (CGSConnectionID, Int32, Int32) -> CGSSpaceID
typealias SLSSpaceSetTypeFunc = @convention(c) (CGSConnectionID, CGSSpaceID, Int32) -> Void
typealias SLSShowSpacesFunc = @convention(c) (CGSConnectionID, CFArray) -> Void
typealias SLSSpaceSetOwnerFunc = @convention(c) (CGSConnectionID, CGSSpaceID, Int32) -> Void

var _slsSpaceCreate: SLSSpaceCreateFunc?
var _slsSpaceSetType: SLSSpaceSetTypeFunc?
var _slsShowSpaces: SLSShowSpacesFunc?
var _slsSpaceSetOwner: SLSSpaceSetOwnerFunc?

func loadSkyLightFunctions() -> Bool {
    guard let handle = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY) else {
        return false
    }

    guard let createSym = dlsym(handle, "SLSSpaceCreate"),
          let setTypeSym = dlsym(handle, "SLSSpaceSetType"),
          let showSym = dlsym(handle, "SLSShowSpaces") else {
        return false
    }

    _slsSpaceCreate = unsafeBitCast(createSym, to: SLSSpaceCreateFunc.self)
    _slsSpaceSetType = unsafeBitCast(setTypeSym, to: SLSSpaceSetTypeFunc.self)
    _slsShowSpaces = unsafeBitCast(showSym, to: SLSShowSpacesFunc.self)

    if let ownerSym = dlsym(handle, "SLSSpaceSetOwners") {
        _slsSpaceSetOwner = unsafeBitCast(ownerSym, to: SLSSpaceSetOwnerFunc.self)
    }

    return true
}

let kSLSSpaceTypeUser: Int32 = 0

// MARK: - Shared helpers

func log(_ msg: String) {
    FileHandle.standardError.write("[\(ProcessInfo.processInfo.processIdentifier)] \(msg)\n".data(using: .utf8)!)
}

func getAllSpaceIDs() -> [CGSSpaceID] {
    let cid = CGSMainConnectionID()
    guard let spacesInfo = CGSCopyManagedDisplaySpaces(cid) as? [[String: Any]] else {
        return []
    }
    var result: [CGSSpaceID] = []
    for display in spacesInfo {
        if let spaces = display["Spaces"] as? [[String: Any]] {
            for space in spaces {
                if let id64 = space["id64"] as? CGSSpaceID {
                    result.append(id64)
                }
            }
        }
    }
    return result
}

func getAllUserSpaces() -> [(id: CGSSpaceID, index: Int)] {
    let cid = CGSMainConnectionID()
    guard let spacesInfo = CGSCopyManagedDisplaySpaces(cid) as? [[String: Any]] else {
        return []
    }

    var result: [(id: CGSSpaceID, index: Int)] = []
    var index = 1
    for display in spacesInfo {
        if let spaces = display["Spaces"] as? [[String: Any]] {
            for space in spaces {
                if let id64 = space["id64"] as? CGSSpaceID,
                   let type = space["type"] as? Int, type == Int(kSLSSpaceTypeUser) {
                    result.append((id: id64, index: index))
                    index += 1
                }
            }
        }
    }
    return result
}

func getDisplayUUID() -> CFString? {
    let cid = CGSMainConnectionID()
    let activeSpace = CGSGetActiveSpace(cid)
    if activeSpace != 0 {
        return CGSCopyManagedDisplayForSpace(cid, activeSpace)
    }
    // Fallback: get from first display in managed spaces
    guard let spacesInfo = CGSCopyManagedDisplaySpaces(cid) as? [[String: Any]],
          let firstDisplay = spacesInfo.first,
          let displayID = firstDisplay["Display Identifier"] as? String else {
        return nil
    }
    return displayID as CFString
}

// MARK: - List windows mode

func listWindows() {
    guard let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        print("[]")
        return
    }

    var results: [[String: Any]] = []
    for win in windowList {
        var entry: [String: Any] = [:]
        if let num = win[kCGWindowNumber as String] as? Int {
            entry["windowNumber"] = num
        }
        if let owner = win[kCGWindowOwnerName as String] as? String {
            entry["ownerName"] = owner
        }
        if let ownerPid = win[kCGWindowOwnerPID as String] as? Int {
            entry["ownerPID"] = ownerPid
        }
        if let name = win[kCGWindowName as String] as? String {
            entry["name"] = name
        }
        if let bounds = win[kCGWindowBounds as String] as? [String: Any] {
            entry["bounds"] = bounds
        }
        if let layer = win[kCGWindowLayer as String] as? Int {
            entry["layer"] = layer
        }
        results.append(entry)
    }

    if let data = try? JSONSerialization.data(withJSONObject: results, options: []),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("[]")
    }
}

// MARK: - List spaces mode

func listSpaces() {
    let spaces = getAllUserSpaces()
    var results: [[String: Any]] = []
    for space in spaces {
        results.append([
            "id": space.id,
            "index": space.index,
            "label": "Desktop \(space.index)"
        ])
    }

    if let data = try? JSONSerialization.data(withJSONObject: results, options: []),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("[]")
    }
}

// MARK: - Gather mode

struct WindowGroup: Decodable {
    let label: String
    let windowIds: [Int]
}

struct GatherInput: Decodable {
    let groups: [WindowGroup]
    let targetSpaceId: UInt64?
}

struct GatherResultData: Encodable {
    let success: Bool
    let spacesCreated: Int
    let windowsMoved: Int
    let errors: [String]
}

func createNewSpace() -> CGSSpaceID? {
    guard loadSkyLightFunctions() else {
        log("Could not load SkyLight framework")
        return nil
    }

    let cid = CGSMainConnectionID()
    let spacesBefore = getAllSpaceIDs()
    log("Spaces before creation: \(spacesBefore)")

    // Create the space
    let newId = _slsSpaceCreate!(cid, 1, 0)
    log("SLSSpaceCreate returned: \(newId)")
    if newId == 0 {
        return nil
    }

    // Set it as a user-type space (regular desktop)
    _slsSpaceSetType!(cid, newId, kSLSSpaceTypeUser)
    log("Set space type to user")

    // Show the space
    _slsShowSpaces!(cid, [newId] as CFArray)
    log("Called SLSShowSpaces")

    usleep(500_000) // 500ms for the space to register

    let spacesAfter = getAllSpaceIDs()
    log("Spaces after creation: \(spacesAfter)")

    // Verify the space exists
    let userSpaces = getAllUserSpaces()
    let found = userSpaces.first { $0.id == newId }
    if found != nil {
        log("New space \(newId) found in user spaces")
    } else {
        log("WARNING: New space \(newId) NOT found in user spaces list")
        // Check if it's in any space list at all
        if spacesAfter.contains(newId) {
            log("But it IS in the all-spaces list (might be non-user type)")
        }
    }

    return newId
}

func gatherWindows() {
    let inputData = FileHandle.standardInput.readDataToEndOfFile()
    guard inputData.count > 0 else {
        outputResult(GatherResultData(success: false, spacesCreated: 0, windowsMoved: 0, errors: ["No input data on stdin"]))
        return
    }

    guard let input = try? JSONDecoder().decode(GatherInput.self, from: inputData) else {
        outputResult(GatherResultData(success: false, spacesCreated: 0, windowsMoved: 0, errors: ["Failed to parse JSON input"]))
        return
    }

    let cid = CGSMainConnectionID()
    log("CGS connection ID: \(cid)")

    let allWindowIds = input.groups.flatMap { $0.windowIds }
    if allWindowIds.isEmpty {
        outputResult(GatherResultData(success: true, spacesCreated: 0, windowsMoved: 0, errors: []))
        return
    }
    log("Window IDs to move: \(allWindowIds)")

    var targetSpace: CGSSpaceID
    var spacesCreated = 0

    if let existingId = input.targetSpaceId {
        targetSpace = existingId
        log("Using existing space: \(existingId)")

        // Verify the space exists
        let allSpaces = getAllUserSpaces()
        let found = allSpaces.first { $0.id == existingId }
        if found == nil {
            log("WARNING: Target space \(existingId) not found in user spaces")
            // Try anyway
        }
    } else {
        log("Creating new space...")
        guard let newId = createNewSpace() else {
            outputResult(GatherResultData(success: false, spacesCreated: 0, windowsMoved: 0, errors: ["Failed to create new space"]))
            return
        }
        targetSpace = newId
        spacesCreated = 1
        log("New space created: \(newId)")
    }

    // Move windows using CGSMoveWindowsToManagedSpace (the function that actually moves them)
    let windowIDs = allWindowIds as CFArray
    log("Calling CGSMoveWindowsToManagedSpace with \(allWindowIds.count) windows to space \(targetSpace)")
    CGSMoveWindowsToManagedSpace(cid, windowIDs, targetSpace)
    log("CGSMoveWindowsToManagedSpace completed")

    let windowsMoved = allWindowIds.count
    outputResult(GatherResultData(success: true, spacesCreated: spacesCreated, windowsMoved: windowsMoved, errors: []))
}

func outputResult(_ result: GatherResultData) {
    if let data = try? JSONEncoder().encode(result),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("{\"success\":false,\"spacesCreated\":0,\"windowsMoved\":0,\"errors\":[\"Failed to encode result\"]}")
    }
}

// MARK: - Main

if CommandLine.arguments.contains("--list-windows") {
    listWindows()
} else if CommandLine.arguments.contains("--list-spaces") {
    listSpaces()
} else {
    gatherWindows()
}
