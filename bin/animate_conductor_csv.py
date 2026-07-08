#!/usr/bin/env python3
import os
import sys
import time
import csv
import argparse
from datetime import datetime

def clear_screen():
    sys.stdout.write("\033[H\033[J")
    sys.stdout.flush()

def run_hud_mode(events):
    # Track status map: track -> current state
    track_states = {}
    active_tracks = set()
    completed_tracks = set()
    
    logs = []
    max_logs = 10

    print("Starting Conductor Timeline HUD Animation...")
    time.sleep(1)

    for event in events:
        track = event["track"]
        activity = event["activity"]
        timestamp = event["timestamp"]
        details = event["details"]

        dt_str = timestamp.split('T')[0]

        # Update states
        track_states[track] = activity
        if activity == "impl_started":
            active_tracks.add(track)
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

        clear_screen()
        
        print("=" * 80)
        print(f"  CONDUCTOR DEVELOPMENT TIMELINE HUD  |  SIMULATED DATE: {dt_str}")
        print("=" * 80)
        print()

        print("🛰️  ACTIVE TRACKS IN PROGRESS:")
        print("-" * 80)
        if not active_tracks:
            print("   [No active tracks - main branch is quiet]")
        else:
            for t in sorted(active_tracks):
                print(f"   \033[1;32m🟢 {t:<60}\033[0m [ACTIVE]")
        print("-" * 80)
        print()

        print(f"✅ COMPLETED TRACKS: {len(completed_tracks)}  |  TOTAL TRACKS SEEN: {len(track_states)}")
        print()

        print("📜 RECENT LOG ACTIVITY:")
        print("-" * 80)
        for l in logs:
            print(f"   {l}")
        print("-" * 80)
        
        time.sleep(0.4)

def run_log_mode(events):
    import re
    active_stack = [] # holds active tracks in order of birth
    track_start_times = {} # maps short_track -> start datetime
    track_end_times = {} # maps short_track -> end datetime
    last_seen_day = None
    max_parallelism = 0
    max_parallelism_timestamp = None
    
    # Calculate the maximum length of track names dynamically to minimize whitespace padding
    max_track_len = max(len(re.sub(r'_\d{8}$', '', event["track"])) for event in events)

    def to_pascal_case(name):
        parts = name.split()
        if len(parts) > 1 and parts[0].startswith('#'):
            prefix = parts[0] + " "
            name_body = " ".join(parts[1:])
        else:
            prefix = ""
            name_body = name
        words = name_body.replace('_', ' ').replace('-', ' ').split()
        pascal_body = "".join(w.capitalize() for w in words)
        return prefix + pascal_body

    def format_duration(delta):
        total_seconds = int(delta.total_seconds())
        if total_seconds < 0:
            return "0s"
        
        days = total_seconds // 86400
        hours = (total_seconds % 86400) // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60

        if days > 0:
            return f"{days}d {hours}h{minutes}m"
        if hours > 0:
            return f"{hours}h{minutes}m"
        if minutes > 0:
            if minutes < 5:
                return f"{minutes}m{seconds}s"
            return f"{minutes}m"
        return f"{seconds}s"

    print("=" * 120)
    print(f" {'TIMESTAMP':<16} | {'ACTIVITY AND ACTIVE TRACK STACK':<65}")
    print("=" * 120)

    for event in events:
        track = event["track"]
        activity = event["activity"]
        timestamp = event["timestamp"]
        commit_count = event.get("commit_count", 0)

        # Parse date and time
        dt_str = timestamp.split('T')[0]
        time_str = timestamp.split('T')[1].split('+')[0][:5]

        # Highlight new day in yellow
        if dt_str != last_seen_day:
            colored_day = f"\033[1;33m{dt_str}\033[0m"
            last_seen_day = dt_str
        else:
            colored_day = dt_str
        display_time = f"{colored_day} {time_str}"

        # Shorten track name: remove _YYYYMMDD suffix
        short_track = re.sub(r'_\d{8}$', '', track)

        # Update stack: push on start, pop/remove on merge
        if activity == "impl_started":
            if short_track not in active_stack:
                active_stack.append(short_track)
            if short_track not in track_start_times:
                track_start_times[short_track] = datetime.fromisoformat(timestamp)
        elif activity == "impl_ended":
            if short_track not in track_end_times:
                track_end_times[short_track] = datetime.fromisoformat(timestamp)
        elif activity == "merged":
            if short_track in active_stack:
                active_stack.remove(short_track)

        # Track peak parallelism
        current_parallelism = len(active_stack)
        if current_parallelism > max_parallelism:
            max_parallelism = current_parallelism
            max_parallelism_timestamp = display_time

        # Format log emoji and colored state
        act_emoji = "🌿"
        colored_act = activity.upper()
        if activity == "spec_created":
            act_emoji = "📝"
            colored_act = f"\033[1;34mSPEC_CREATED\033[0m"
        elif activity == "impl_started":
            act_emoji = "🚀"
            colored_act = f"\033[1;33mIMPL_STARTED\033[0m"
        elif activity == "impl_ended":
            act_emoji = "🏁"
            colored_act = f"\033[1;35mIMPL_ENDED  \033[0m"
        elif activity == "merged":
            act_emoji = "🔀"
            colored_act = f"\033[1;32mMERGED      \033[0m"

        # Calculate duration
        duration_str = ""
        if activity == "impl_ended" and short_track in track_start_times:
            start_dt = track_start_times[short_track]
            end_dt = datetime.fromisoformat(timestamp)
            delta = end_dt - start_dt
            duration_str = f" \033[1;30m(impl took {format_duration(delta)})\033[0m"
        elif activity == "merged":
            commit_info = f", {commit_count} commits" if commit_count > 0 else ""
            if short_track in track_end_times:
                end_dt = track_end_times[short_track]
                merge_dt = datetime.fromisoformat(timestamp)
                delta = merge_dt - end_dt
                duration_str = f" \033[1;30m(merge took {format_duration(delta)}{commit_info})\033[0m"
            elif short_track in track_start_times:
                start_dt = track_start_times[short_track]
                merge_dt = datetime.fromisoformat(timestamp)
                delta = merge_dt - start_dt
                duration_str = f" \033[1;30m(took {format_duration(delta)})\033[0m"

        # Print sequential log line
        if len(active_stack) > 0:
            colored_count = f"\033[1;33m{len(active_stack)}\033[0m"
            # Format to PascalCase, space separated, and cap to 40 characters
            pascal_active = [to_pascal_case(t) for t in active_stack]
            joined_active = " ".join(pascal_active)
            if len(joined_active) > 40:
                joined_active = joined_active[:37] + "..."
            
            colored_words = []
            for word in joined_active.split():
                if word == "...":
                    colored_words.append("\033[1;30m...\033[0m")
                else:
                    colored_words.append(f"\033[1;37m{word}\033[0m")
            colored_joined_active = " ".join(colored_words)
            active_repr = f"({colored_joined_active})"
            print(f"{display_time} {act_emoji} {colored_act:<22} {short_track:<{max_track_len}}{duration_str} | {colored_count} {active_repr}")
        else:
            print(f"{display_time} {act_emoji} {colored_act:<22} {short_track:<{max_track_len}}{duration_str}")
        
        time.sleep(0.15)

    # Force stack back to zero at the end of the simulation if anything is left
    if active_stack:
        active_stack.clear()
        print(f"{display_time} 🔀 \033[1;32mMERGED      \033[0m ALL TRACKS COMPLETED")

    print("\n📊 Summary Stats:")
    print(f"   Maximum parallelism reached: \033[1;33m{max_parallelism}\033[0m tracks concurrently active (at {max_parallelism_timestamp})")

def main():
    parser = argparse.ArgumentParser(description="Animate Conductor timeline CSV")
    parser.add_argument("csv_file", default="conductor.csv", nargs="?", help="Path to Conductor CSV file")
    parser.add_argument("--hud", action="store_true", help="Run in graphical HUD dashboard mode")
    parser.add_argument("--max-rows", type=int, default=None, help="Maximum execution lines to process")
    args = parser.parse_args()

    if not os.path.exists(args.csv_file):
        print(f"Error: CSV file '{args.csv_file}' not found. Run extract_conductor_csv.py first.")
        sys.exit(1)

    events = []
    with open(args.csv_file, 'r') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) >= 4:
                events.append({
                    "timestamp": row[0],
                    "track": row[1],
                    "activity": row[2],
                    "details": row[3],
                    "commit_count": int(row[4]) if len(row) >= 5 else 0
                })

    if not events:
        print("No events to animate.")
        return

    if args.max_rows is not None:
        events = events[:args.max_rows]

    if args.hud:
        run_hud_mode(events)
    else:
        run_log_mode(events)

if __name__ == "__main__":
    main()
