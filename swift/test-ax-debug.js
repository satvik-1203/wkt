const { app } = require('electron');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.whenReady().then(async () => {
    const addon = require('/Users/satviks/react_app/dev-ux/native/build/Release/spaces.node');

    // Focus Spotify
    addon.runAppleScript(`
        tell application "System Events"
            tell process "Spotify"
                set frontmost to true
            end tell
        end tell
    `);
    await sleep(500);

    // Check what elements the title bar has
    let r = addon.runAppleScript(`
        tell application "System Events"
            tell process "Spotify"
                tell window 1
                    set allElements to every UI element
                    set output to ""
                    repeat with elem in allElements
                        try
                            set output to output & (class of elem as string) & ": " & (description of elem as string) & " - " & (subrole of elem as string) & linefeed
                        on error
                            try
                                set output to output & (class of elem as string) & ": " & (description of elem as string) & linefeed
                            end try
                        end try
                    end repeat
                    return output
                end tell
            end tell
        end tell
    `);
    console.log('Window UI elements:', r);

    // Try accessing the green "fullscreen" button - it has the "Move to Desktop" menu
    r = addon.runAppleScript(`
        tell application "System Events"
            tell process "Spotify"
                tell window 1
                    -- Look for the fullscreen button (usually button 3 in the traffic lights)
                    set btns to every button
                    set output to ""
                    repeat with b in btns
                        try
                            set output to output & "Button: " & (description of b as string) & " subrole=" & (subrole of b as string) & linefeed
                        on error
                            try
                                set output to output & "Button: " & (description of b as string) & linefeed
                            end try
                        end try
                    end repeat
                    return output
                end tell
            end tell
        end tell
    `);
    console.log('Buttons:', r);

    // Try to click the full screen button with Option held (this shows the "Move to" menu)
    // Or try AXShowMenu action on the zoom button
    r = addon.runAppleScript(`
        tell application "System Events"
            tell process "Spotify"
                tell window 1
                    set btns to every button
                    set output to ""
                    repeat with b in btns
                        try
                            set acts to name of every action of b
                            set desc to description of b
                            set output to output & desc & " actions: " & (acts as string) & linefeed
                        end try
                    end repeat
                    return output
                end tell
            end tell
        end tell
    `);
    console.log('Button actions:', r);

    app.quit();
});
