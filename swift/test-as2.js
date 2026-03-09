const { app } = require('electron');

app.whenReady().then(() => {
    const spaces = require('/Users/satviks/react_app/dev-ux/native/build/Release/spaces.node');
    console.log('Accessibility:', spaces.isAccessibilityTrusted());

    // Test 1: Simple math
    let r = spaces.runAppleScript('return 2 + 2');
    console.log('Test 1 (math):', r);

    // Test 2: System Events process count (lightweight)
    r = spaces.runAppleScript('tell application "System Events" to return count of processes');
    console.log('Test 2 (process count):', r);

    // Test 3: Frontmost app
    r = spaces.runAppleScript('tell application "System Events" to return name of first process whose frontmost is true');
    console.log('Test 3 (frontmost):', r);

    // Test 4: Check if we can set frontmost
    r = spaces.runAppleScript('tell application "System Events" to set frontmost of process "Spotify" to true');
    console.log('Test 4 (set frontmost):', r);

    // Test 5: Check title bar right-click menu items
    // First, let's just check the window properties
    r = spaces.runAppleScript(`
        tell application "System Events"
            tell process "Spotify"
                set winCount to count of windows
                if winCount > 0 then
                    set w to window 1
                    set winTitle to name of w
                    return "Window: " & winTitle
                end if
                return "No windows"
            end tell
        end tell
    `);
    console.log('Test 5 (Spotify window):', r);

    setTimeout(() => app.quit(), 1000);
});
