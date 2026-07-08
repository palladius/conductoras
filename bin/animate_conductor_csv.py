#!/usr/bin/env python3
import os
import sys
import time
import csv
from datetime import datetime

def clear_screen():
    sys.stdout.write("\033[H\033[J")
    sys.stdout.flush()

def main():
    csv_file = "conductor.csv"
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    
    if not os.path.exists(csv_file):
        print(f"Error: CSV file '{csv_file}' not found. Run extract_conductor_csv.py first.")
        sys.exit(1)

    # Read events
    events = []
    with open(csv_file, 'r') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) >= 4:
                events.append({
                    "timestamp": row[0],
                    "track": row[1],
                    "activity": row[2],
                    "details": row[3]
                })

    if not events:
        print("No events to animate.")
        return

    # Track status map: track -> current state
    track_states = {}
    active_tracks = set()
    completed_tracks = set()
    
    # Scrolling activity logs
    logs = []
    max_logs = 10

    print("Starting Conductor Timeline Text Animation...")
    time.sleep(1)

    for i, event in enumerate(events):
        track = event["track"]
        activity = event["activity"]
        timestamp = event["timestamp"]
        details = event["details"]

        # Parse date for display
        dt_str = timestamp.split('T')[0]

        # Update states
        track_states[track] = activity
        if activity == "spec_created":
            pass
        elif activity == "impl_started":
            active_tracks.add(track)
        elif activity == "impl_ended":
            pass
        elif activity == "merged":
            if track in active_tracks:
                active_tracks.remove(track)
            completed_tracks.add(track)

        # Format log entry
        act_emoji = "🌿"
        if activity == "spec_created":
            act_emoji = "📝"
        elif activity == "impl_started":
            act_emoji = "🚀"
        elif activity == "impl_ended":
            act_emoji = "🏁"
        elif activity == "merged":
            act_emoji = "🔀"

        log_msg = f"[{dt_str}] {act_emoji} {track}: {activity.upper()} ({details[:60]})"
        logs.append(log_msg)
        if len(logs) > max_logs:
            logs.pop(0)

        # Render screen
        clear_screen()
        
        # Header
        print("=" * 80)
        print(f"  CONDUCTOR DEVELOPMENT TIMELINE ANIMATION  |  SIMULATED DATE: {dt_str}")
        print("=" * 80)
        print()

        # Active tracks column
        print("🛰️  ACTIVE TRACKS IN PROGRESS:")
        print("-" * 80)
        if not active_tracks:
            print("   [No active tracks - main branch is quiet]")
        else:
            for t in sorted(active_tracks):
                print(f"   \033[1;32m🟢 {t:<60}\033[0m [ACTIVE]")
        print("-" * 80)
        print()

        # Completed tracks count
        print(f"✅ COMPLETED TRACKS: {len(completed_tracks)}  |  TOTAL TRACKS SEEN: {len(track_states)}")
        print()

        # Activity logs
        print("📜 RECENT LOG ACTIVITY:")
        print("-" * 80)
        for l in logs:
            print(f"   {l}")
        print("-" * 80)
        
        # Pause briefly to animate
        time.sleep(0.4)

    # End summary
    print("\nAnimation completed successfully!")
    print(f"Final summary: {len(completed_tracks)} tracks processed and merged.")

if __name__ == "__main__":
    main()
