#!/usr/bin/env python3
import os
import re
import csv
import json
import argparse
import subprocess

def run_git_log(repo_path):
    cmd = ["git", "log", "--all", "--reverse", "--name-only", "--format=COMMIT|%H|%cI|%an|%s"]
    res = subprocess.run(cmd, cwd=repo_path, check=True, capture_output=True, text=True)
    return res.stdout.split('\n')

def extract_track_name_from_path(path):
    parts = path.split('/')
    if len(parts) >= 3 and parts[0] == 'conductor' and parts[1] == 'tracks':
        return parts[2]
    return None

def main():
    parser = argparse.ArgumentParser(description="Extract Conductor tracks history into a 4-column CSV")
    parser.add_argument("--repo", default=".", help="Path to git repository")
    parser.add_argument("--out", default="conductor.csv", help="Output CSV path")
    args = parser.parse_args()

    repo_path = os.path.abspath(args.repo)
    if not os.path.exists(os.path.join(repo_path, ".git")):
        print(f"Error: {repo_path} is not a valid Git repository.")
        return

    # Load track metadata
    metadata = {}
    tracks_dir = os.path.join(repo_path, "conductor", "tracks")
    if os.path.exists(tracks_dir):
        for t_name in os.listdir(tracks_dir):
            t_path = os.path.join(tracks_dir, t_name)
            if os.path.isdir(t_path):
                meta_file = os.path.join(t_path, "metadata.json")
                if os.path.exists(meta_file):
                    try:
                        with open(meta_file, 'r') as f:
                            metadata[t_name] = json.load(f)
                    except:
                        pass

    # Read git log
    lines = run_git_log(repo_path)
    commits = []
    current_commit = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("COMMIT|"):
            if current_commit:
                commits.append(current_commit)
            parts = line.split("|")
            current_commit = {
                "sha": parts[1],
                "date": parts[2],
                "author": parts[3],
                "message": parts[4],
                "files": []
            }
        elif current_commit:
            current_commit["files"].append(line)
            
    if current_commit:
        commits.append(current_commit)

    tracks_info = {}

    for commit in commits:
        sha = commit["sha"]
        date = commit["date"]
        msg = commit["message"]
        author = commit["author"]
        
        touched_tracks = set()
        has_impl_changes = False
        
        for f in commit["files"]:
            t_name = extract_track_name_from_path(f)
            if t_name:
                touched_tracks.add(t_name)
            else:
                has_impl_changes = True

        for track_id in metadata.keys():
            clean_id = track_id.lower()
            if clean_id in msg.lower() or clean_id.replace('_', '-') in msg.lower():
                touched_tracks.add(track_id)
            for f in commit["files"]:
                if clean_id in f.lower():
                    touched_tracks.add(track_id)

        for t in touched_tracks:
            if t not in tracks_info:
                display_name = t
                ghi = "N/A"
                if t in metadata:
                    display_name = metadata[t].get("title", t)
                    ghi = metadata[t].get("github_issue_number") or metadata[t].get("issue_number") or "N/A"
                
                tracks_info[t] = {
                    "id": t,
                    "display_name": display_name,
                    "ghi": ghi,
                    "creation": None,
                    "impl_start": None,
                    "impl_end": None,
                    "merge": None,
                    "creation_details": "",
                    "impl_start_details": "",
                    "impl_end_details": "",
                    "merge_details": "",
                    "all_commits": []
                }
            
            t_info = tracks_info[t]
            t_info["all_commits"].append(commit)

            if not t_info["creation"]:
                t_info["creation"] = date
                t_info["creation_details"] = f"Created spec by {author}: {msg}"
                
            if has_impl_changes:
                if not t_info["impl_start"]:
                    t_info["impl_start"] = date
                    t_info["impl_start_details"] = f"First implementation commit by {author}: {msg}"
                t_info["impl_end"] = date
                t_info["impl_end_details"] = f"Latest implementation commit by {author}: {msg}"

            if "merge" in msg.lower() and (t.lower() in msg.lower() or any(t.lower() in f.lower() for f in commit["files"])):
                t_info["merge"] = date
                t_info["merge_details"] = f"Merged branch by {author}: {msg}"

    # Clean fallback for missing dates
    for t, info in list(tracks_info.items()):
        if not info["impl_start"]:
            info["impl_start"] = info["creation"]
            info["impl_start_details"] = "Impl start fallback to creation date"
        if not info["impl_end"]:
            info["impl_end"] = info["impl_start"]
            info["impl_end_details"] = "Impl end fallback to impl start date"
        if not info["merge"]:
            if info["all_commits"]:
                info["merge"] = info["all_commits"][-1]["date"]
                info["merge_details"] = f"Merge fallback to latest commit: {info['all_commits'][-1]['message']}"

    # Compile CSV rows
    csv_rows = []
    for t, info in tracks_info.items():
        if t in metadata or t.replace('_', '-') in metadata or t.replace('-', '_') in metadata:
            track_name = info["display_name"]
            ghi_str = f"#{info['ghi']}" if info['ghi'] != "N/A" else ""
            display_label = f"{ghi_str} {track_name}".strip()
            commits_count = len(info["all_commits"])
            
            csv_rows.append({
                "timestamp": info["creation"],
                "track": display_label,
                "activity": "spec_created",
                "details": info["creation_details"],
                "commit_count": commits_count
            })
            csv_rows.append({
                "timestamp": info["impl_start"],
                "track": display_label,
                "activity": "impl_started",
                "details": info["impl_start_details"],
                "commit_count": commits_count
            })
            csv_rows.append({
                "timestamp": info["impl_end"],
                "track": display_label,
                "activity": "impl_ended",
                "details": info["impl_end_details"],
                "commit_count": commits_count
            })
            csv_rows.append({
                "timestamp": info["merge"],
                "track": display_label,
                "activity": "merged",
                "details": info["merge_details"],
                "commit_count": commits_count
            })

    # Sort all rows chronologically by timestamp
    csv_rows.sort(key=lambda x: x["timestamp"])

    # Write CSV file
    with open(args.out, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "track", "activity", "details", "commit_count"])
        for row in csv_rows:
            writer.writerow([row["timestamp"], row["track"], row["activity"], row["details"], row["commit_count"]])

    print(f"Exported {len(csv_rows)} lifecycle event rows with commit counts to {args.out}")

if __name__ == "__main__":
    main()
