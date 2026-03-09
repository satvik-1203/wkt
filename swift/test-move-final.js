const { app } = require('electron');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.whenReady().then(async () => {
    const addon = require('/Users/satviks/react_app/dev-ux/native/build/Release/spaces.node');

    addon.runAppleScript(`
        tell application "System Events"
            tell process "Spotify"
                set frontmost to true
            end tell
        end tell
    `);
    await sleep(500);

    // Deep-dive into the button's child element structure
    let r = addon.runAppleScript(`
        tell application "System Events"
            tell process "Spotify"
                tell window 1
                    set fsBtn to first button whose subrole is "AXFullScreenButton"
                    perform action "AXShowMenu" of fsBtn
                    delay 0.5

                    set popupMenu to first UI element of fsBtn
                    set output to "Menu class: " & (class of popupMenu as string) & linefeed
                    set output to output & "Menu role: " & (role of popupMenu as string) & linefeed
                    try
                        set output to output & "Menu subrole: " & (subrole of popupMenu as string) & linefeed
                    end try

                    -- Get all children
                    set children to every UI element of popupMenu
                    set output to output & "Children count: " & (count of children) & linefeed

                    repeat with child in children
                        try
                            set childClass to class of child as string
                            set childRole to role of child as string
                            set childTitle to ""
                            try
                                set childTitle to title of child as string
                            end try
                            set childName to ""
                            try
                                set childName to name of child as string
                            end try
                            set childDesc to ""
                            try
                                set childDesc to description of child as string
                            end try
                            set output to output & childClass & " role=" & childRole & " title=" & childTitle & " name=" & childName & " desc=" & childDesc & linefeed
                        end try
                    end repeat

                    return output
                end tell
            end tell
        end tell
    `);
    console.log('Menu structure:', r);

    addon.pressKey(53);
    await sleep(500);
    app.quit();
});
