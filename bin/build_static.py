#!/usr/bin/env python3
import os
import sys
import json
import argparse
import subprocess

# Ensure git_arcade_parser can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from git_arcade_parser import GitHistoryParser

def generate_milestones_json(repo_path, output_dir):
    # Scan conductor/tracks/ to load metadata
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

    # Run git log
    cmd = ["git", "log", "--all", "--reverse", "--name-only", "--format=COMMIT|%H|%cI|%an|%s"]
    try:
        res = subprocess.run(cmd, cwd=repo_path, check=True, capture_output=True, text=True)
        lines = res.stdout.split('\n')
    except Exception as e:
        print("Failed to run git log for milestones:", e)
        return

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
        
        touched_tracks = set()
        has_impl_changes = False
        
        for f in commit["files"]:
            parts = f.split('/')
            if len(parts) >= 3 and parts[0] == 'conductor' and parts[1] == 'tracks':
                touched_tracks.add(parts[2])
            else:
                has_impl_changes = True

        for track_id in metadata:
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
                    meta = metadata[t]
                    desc = meta.get("description", t)
                    display_name = desc[:45] + "..." if len(desc) > 45 else desc
                    if "github_issue" in meta and isinstance(meta["github_issue"], dict):
                        ghi = str(meta["github_issue"].get("number", "N/A"))
                    elif "github_issue_url" in meta:
                        p = meta["github_issue_url"].rstrip('/').split('/')
                        if p[-1].isdigit():
                            ghi = p[-1]
                
                tracks_info[t] = {
                    "id": t,
                    "display_name": display_name,
                    "ghi": ghi,
                    "creation": None,
                    "impl_start": None,
                    "impl_end": None,
                    "merge": None,
                    "all_commits": []
                }
            
            t_info = tracks_info[t]
            t_info["all_commits"].append(commit)

            if not t_info["creation"]:
                t_info["creation"] = date
                
            if has_impl_changes:
                if not t_info["impl_start"]:
                    t_info["impl_start"] = date
                t_info["impl_end"] = date

            if "merge" in msg.lower() and (t.lower() in msg.lower() or any(t.lower() in f.lower() for f in commit["files"])):
                t_info["merge"] = date

    for t, info in list(tracks_info.items()):
        if not info["impl_start"]:
            info["impl_start"] = info["creation"]
        if not info["impl_end"]:
            info["impl_end"] = info["impl_start"]
        if not info["merge"]:
            if info["all_commits"]:
                info["merge"] = info["all_commits"][-1]["date"]

    valid_tracks = {}
    for t, info in tracks_info.items():
        if t in metadata or t.replace('_', '-') in metadata or t.replace('-', '_') in metadata:
            valid_tracks[t] = info

    output_data = []
    for t, info in sorted(valid_tracks.items(), key=lambda x: x[1]["creation"]):
        output_data.append({
            "id": info["id"],
            "display_name": info["display_name"],
            "ghi": info["ghi"],
            "creation": info["creation"],
            "impl_start": info["impl_start"],
            "impl_end": info["impl_end"],
            "merge": info["merge"]
        })

    milestones_file = os.path.join(output_dir, "milestones.json")
    with open(milestones_file, "w") as f:
        json.dump(output_data, f, indent=2)
    print(f"Saved {len(output_data)} track milestones to {milestones_file}")

def main():
    parser = argparse.ArgumentParser(description="Static Builder for Git History Arcade")
    parser.add_argument("repo_path", help="Path to the git repository you want to statically export")
    args = parser.parse_args()

    repo_path = os.path.abspath(args.repo_path)
    if not os.path.exists(repo_path) or not os.path.exists(os.path.join(repo_path, ".git")):
        print(f"Error: {repo_path} is not a valid git repository.")
        sys.exit(1)

    repo_name = os.path.basename(repo_path)
    
    html_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "html"))
    output_dir = os.path.join(html_dir, repo_name)
    os.makedirs(output_dir, exist_ok=True)
    
    output_file = os.path.join(output_dir, "timeline.json")
    
    print(f"Parsing history for '{repo_name}'...")
    history_parser = GitHistoryParser(repo_path)
    timeline = history_parser.generate_json_timeline()
    
    with open(output_file, "w") as f:
        json.dump(timeline, f, indent=2)
        
    print(f"Saved {len(timeline)} commits to {output_file}")
    
    # Save tracks.json
    tracks_dir = os.path.join(repo_path, "conductor", "tracks")
    tracks = []
    if os.path.isdir(tracks_dir):
        tracks = [d for d in os.listdir(tracks_dir) if os.path.isdir(os.path.join(tracks_dir, d))]
    tracks.sort()
    
    tracks_file = os.path.join(output_dir, "tracks.json")
    with open(tracks_file, "w") as f:
        json.dump(tracks, f, indent=2)
    print(f"Saved {len(tracks)} tracks to {tracks_file}")

    # Generate milestones.json
    generate_milestones_json(repo_path, output_dir)
    
    # Update repos.json
    repos_json_path = os.path.join(html_dir, "repos.json")
    repos = []
    if os.path.exists(repos_json_path):
        with open(repos_json_path, "r") as f:
            try:
                repos = json.load(f)
            except json.JSONDecodeError:
                pass
                
    # Add if it doesn't exist
    has_conductor = os.path.exists(os.path.join(repo_path, "conductor"))
    existing_repo = next((r for r in repos if r["name"] == repo_name), None)
    
    if existing_repo:
        existing_repo["has_conductor"] = has_conductor
    else:
        repos.append({
            "name": repo_name,
            "has_conductor": has_conductor
        })
        
    # Sort repos
    repos.sort(key=lambda x: (not x["has_conductor"], x["name"].lower()))
    
    with open(repos_json_path, "w") as f:
        json.dump(repos, f, indent=2)
        
    print(f"Updated {repos_json_path}")
    print(f"\nSuccess! You can now view this statically at /index.html?repo={repo_name}")

if __name__ == "__main__":
    main()
