const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function clickMouse(callback) {
    // Add callback parameter to send results back to main process
    const sendResult = (message) => {
        console.log(message);
        if (callback) callback(message);
    };
    
    sendResult('=== CLICK FUNCTION CALLED ===');
    
    // Use AppleScript directly (most compatible with Electron)
    sendResult('Using AppleScript approach');
    fallbackToAppleScript(sendResult);
    
    sendResult('=== CLICK FUNCTION END ===');
}

function fallbackToAppleScript(sendResult) {
    // SUPER FAST mouse position detection and clicking
    sendResult(`⚡ INSTANT mouse detection and click...`);
    
    exec('python3 -c "import tkinter as tk; root=tk.Tk(); print(f\\"{root.winfo_pointerx()},{root.winfo_pointery()}\\"); root.destroy()"', (posError, posOutput, posStderr) => {
        let clickX = 500, clickY = 400; // fallback
        
        if (!posError && posOutput) {
            const coords = posOutput.trim().split(',');
            if (coords.length === 2) {
                clickX = parseInt(coords[0]);
                clickY = parseInt(coords[1]);
                sendResult(`🎯 Instant click at: {${clickX}, ${clickY}}`);
            }
        }
        
        // BLAZING FAST CLICK!
        performRealClick(sendResult, clickX, clickY);
    });
}

function performRealClick(sendResult, x, y) {
    sendResult(`🚀 FAST C PROGRAM CLICK at {${x}, ${y}}`);
    
    // Skip cliclick completely - use optimized C program directly
    const fastCProgram = `
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>

int main() {
    CGPoint point = CGPointMake(${x}, ${y});
    
    // Create and post mouse events instantly
    CGEventRef mouseDown = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
    CGEventRef mouseUp = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);
    
    // Post events with minimal delay
    CGEventPost(kCGHIDEventTap, mouseDown);
    usleep(1000); // Just 1ms delay - super fast!
    CGEventPost(kCGHIDEventTap, mouseUp);
    
    CFRelease(mouseDown);
    CFRelease(mouseUp);
    
    printf("✅ INSTANT CLICK at ${x},${y}");
    return 0;
}
    `;
    
    const tempCFile = path.join(os.tmpdir(), 'fast_click.c');
    const tempExe = path.join(os.tmpdir(), 'fast_click');
    
    try {
        fs.writeFileSync(tempCFile, fastCProgram);
        
        exec(`gcc -framework ApplicationServices -o "${tempExe}" "${tempCFile}" && "${tempExe}"`, (error, stdout, stderr) => {
            // Clean up immediately
            try {
                fs.unlinkSync(tempCFile);
                fs.unlinkSync(tempExe);
            } catch (e) {}
            
            if (error) {
                sendResult(`❌ Fast click failed: ${error.message}`);
            } else {
                sendResult(`⚡ ${stdout.trim()} ⚡`);
            }
        });
        
    } catch (fsError) {
        sendResult(`❌ File creation failed: ${fsError.message}`);
    }
}

module.exports = { clickMouse };