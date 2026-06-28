#!/usr/bin/env python3
import os
import subprocess
import json
import re
from datetime import datetime

class GitHistoryParser:
    def __init__(self, repo_path="."):
        self.repo_path = os.path.abspath(repo_path)

    def generate_json_timeline(self):
        """
        Parses git log to generate a deterministic JSON timeline
        suitable for the HTML5 Canvas engine.
        """
        # Format: %H (hash) | %aI (iso date) | %an (author) | %s (subject) | %D (refs/branches)
        log_format = "%H|%aI|%an|%s|%D"
        cmd = ["git", "log", "--all", "--reverse", "--numstat", f"--format=commit|{log_format}"]
        
        try:
            result = subprocess.run(cmd, cwd=self.repo_path, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"Error running git log: {e.stderr}")
            return []

        lines = result.stdout.strip().split('\n')
        timeline = []
        
        current_commit = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            if line.startswith("commit|"):
                # Save previous commit if exists
                if current_commit:
                    timeline.append(current_commit)
                    
                parts = line.split("|")
                # Parts: ['commit', hash, date, author, subject, refs]
                if len(parts) >= 5:
                    sha = parts[1]
                    date_iso = parts[2]
                    author = parts[3]
                    subject = "|".join(parts[4:-1]) if len(parts) > 6 else parts[4]
                    refs = parts[-1] if len(parts) >= 6 else ""
                    
                    # Try to guess branch from refs
                    # A naive approach for branching visualization
                    branch = "main"
                    if refs:
                        # Refs look like: HEAD -> cuj01, origin/cuj01, cuj01
                        # We'll just grab the first non-HEAD ref as the "branch" for this commit's context
                        ref_list = [r.strip() for r in refs.split(",")]
                        for r in ref_list:
                            if r and not r.startswith("HEAD"):
                                branch = r.replace("origin/", "")
                                break
                    
                    current_commit = {
                        "hash": sha,
                        "timestamp": date_iso,
                        "author": author,
                        "message": subject,
                        "branch": branch,
                        "added": 0,
                        "deleted": 0,
                        "files": []
                    }
                    
                    # Detect merge commits
                    if "Merge" in subject and ("branch" in subject or "pull request" in subject or "into" in subject):
                        current_commit["is_merge"] = True
                        
            elif current_commit and re.match(r"^\d+\s+\d+\s+.*", line):
                # Numstat line: added deleted filename
                stat_parts = line.split()
                if len(stat_parts) >= 3:
                    added_str = stat_parts[0]
                    deleted_str = stat_parts[1]
                    file_name = " ".join(stat_parts[2:])
                    
                    added = int(added_str) if added_str != '-' else 0
                    deleted = int(deleted_str) if deleted_str != '-' else 0
                    
                    current_commit["added"] += added
                    current_commit["deleted"] += deleted
                    current_commit["files"].append({
                        "name": file_name,
                        "added": added,
                        "deleted": deleted
                    })

        if current_commit:
            timeline.append(current_commit)
            
        # Post-process: try to infer branches better if they don't have refs
        # Git doesn't store branches in commits, so we might need to propagate known branches backwards
        # For our arcade, we just need *some* branch tag to spawn a ship
        
        return timeline

    def export_to_file(self, output_path="timeline.json"):
        timeline = self.generate_json_timeline()
        with open(output_path, "w") as f:
            json.dump(timeline, f, indent=2)
        print(f"Exported {len(timeline)} events to {output_path}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Git Arcade Parser")
    parser.add_argument("--repo", default=".", help="Path to git repository")
    parser.add_argument("--out", default="timeline.json", help="Output JSON path")
    args = parser.parse_args()
    
    gp = GitHistoryParser(args.repo)
    gp.export_to_file(args.out)
