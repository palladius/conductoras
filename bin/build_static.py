#!/usr/bin/env python3
import os
import sys
import json
import argparse

# Ensure git_arcade_parser can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from git_arcade_parser import GitHistoryParser

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
