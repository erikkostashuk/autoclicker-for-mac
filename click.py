#!/usr/bin/env python3
import subprocess
import sys

def click_mouse():
    """Simulate a mouse click using AppleScript"""
    applescript = '''
    on run
        tell application "System Events"
            key down shift
            key up shift
        end tell
    end run
    '''
    
    try:
        # This is a workaround - we'll use key events to trigger a click
        # First, let's try the most basic approach
        result = subprocess.run([
            'osascript', '-e', 
            'tell application "System Events" to keystroke "c" using command down'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("Command executed successfully")
        else:
            print(f"Error: {result.stderr}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    click_mouse()