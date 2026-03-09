const { app } = require('electron');

app.whenReady().then(() => {
    const spaces = require('/Users/satviks/react_app/dev-ux/native/build/Release/spaces.node');
    console.log('Accessibility:', spaces.isAccessibilityTrusted());
    if (!spaces.isAccessibilityTrusted()) {
        console.log('Requesting...');
        spaces.requestAccessibility();
    }

    // Test runAppleScript
    console.log('\n--- Testing runAppleScript ---');

    // Simple test
    let r = spaces.runAppleScript('return "hello from NSAppleScript"');
    console.log('Simple test:', r);

    // Test System Events access (uses Electron's accessibility)
    r = spaces.runAppleScript(`
        tell application "System Events"
            return name of every process whose visible is true
        end tell
    `);
    console.log('System Events:', r.success ? r.result.substring(0, 200) : r.error);

    // Test reading Window menu of iTerm2
    r = spaces.runAppleScript(`
        tell application "System Events"
            tell process "iTerm2"
                return name of every menu item of menu 1 of menu bar item "Window" of menu bar 1
            end tell
        end tell
    `);
    console.log('iTerm Window menu:', r.success ? r.result : r.error);

    setTimeout(() => app.quit(), 2000);
});
