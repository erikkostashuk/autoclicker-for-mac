const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function clickMouse(callback) {
    console.log('=== CLICK FUNCTION CALLED ===');
    
    // Add callback parameter to send results back to main process
    const sendResult = (message) => {
        console.log(message);
        if (callback) callback(message);
    };
    
    // Method 1: Try creating and executing a Python script (most reliable on macOS)
    const pythonScript = `
import subprocess
import sys

# Get current mouse position using a different approach
try:
    # Use Python to get mouse position via system calls
    import Quartz
    current_pos = Quartz.NSEvent.mouseLocation()
    x = int(current_pos.x)
    y = int(Quartz.CGDisplayPixelsHigh(0) - current_pos.y)  # Convert coordinates
    click_pos = f"{{{x}, {y}}}"
    print(f"Current mouse position: {x}, {y}")
    print(f"Will click at: {click_pos}")
except ImportError:
    print("Quartz not available, trying alternative method")
    try:
        # Alternative: use system_profiler or other method
        result = subprocess.run(['python3', '-c', 'import tkinter as tk; root=tk.Tk(); print(f"{root.winfo_pointerx()}, {root.winfo_pointery()}"); root.destroy()'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            coords = result.stdout.strip().split(', ')
            x, y = coords[0], coords[1]
            click_pos = f"{{{x}, {y}}}"
            print(f"Got mouse position via tkinter: {click_pos}")
        else:
            print("Fallback method failed, using center of screen")
            click_pos = "{960, 540}"  # Approximate center of common screen sizes
    except Exception as e2:
        print(f"All methods failed: {e2}")
        click_pos = "{960, 540}"
except Exception as e:
    print(f"Error getting mouse position: {e}")
    click_pos = "{960, 540}"

# Try clicking at the current (or default) position
approaches = [
    # Approach 1: Direct click at current mouse position
    ['osascript', '-e', f'tell application "System Events" to click at {click_pos}'],
    
    # Approach 2: Alternative syntax
    ['osascript', '-e', f'tell application "System Events"\\n\\tclick at {click_pos}\\nend tell']
]

for i, cmd in enumerate(approaches, 1):
    print(f"Trying approach {i}: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        print(f"Exit code: {result.returncode}")
        if result.stdout:
            print(f"STDOUT: {result.stdout}")
        if result.stderr:
            print(f"STDERR: {result.stderr}")
        
        if result.returncode == 0:
            print(f"SUCCESS with approach {i}!")
            break
        else:
            print(f"Approach {i} failed")
    except Exception as e:
        print(f"Exception in approach {i}: {e}")

print("Python script completed")
    `;
    
    const tempPythonFile = path.join(os.tmpdir(), 'autoclicker_test.py');
    
    try {
        fs.writeFileSync(tempPythonFile, pythonScript);
        console.log('Created Python script at:', tempPythonFile);
        
        exec(`python3 "${tempPythonFile}"`, { timeout: 10000 }, (error, stdout, stderr) => {
            sendResult('Python execution completed');
            sendResult(`Error: ${error ? error.message : 'none'}`);
            sendResult(`STDOUT: ${stdout}`);
            sendResult(`STDERR: ${stderr}`);
            
            // Clean up
            try {
                fs.unlinkSync(tempPythonFile);
            } catch (e) {
                console.log('Cleanup error:', e.message);
            }
            
            if (error) {
                console.log('Python approach failed, trying direct AppleScript...');
                
                // Fallback: Direct AppleScript with explicit error handling
                const simpleScript = 'tell application "System Events" to click at {700, 700}';
                exec(`/usr/bin/osascript -e "${simpleScript}"`, (fallbackError, fallbackStdout, fallbackStderr) => {
                    console.log('Direct AppleScript fallback:');
                    console.log('Error:', fallbackError ? fallbackError.message : 'none');
                    console.log('STDOUT:', fallbackStdout);
                    console.log('STDERR:', fallbackStderr);
                });
            }
        });
        
    } catch (fsError) {
        console.error('File system error:', fsError.message);
        
        // Last resort: Simple direct command
        console.log('Trying last resort direct command...');
        exec('/usr/bin/osascript -e "tell application \\"System Events\\" to click at {800, 800}"', (lastError, lastStdout, lastStderr) => {
            console.log('Last resort result:');
            console.log('Error:', lastError ? lastError.message : 'none');
            console.log('STDOUT:', lastStdout);
            console.log('STDERR:', lastStderr);
        });
    }
    
    console.log('=== CLICK FUNCTION END ===');
}

module.exports = { clickMouse };