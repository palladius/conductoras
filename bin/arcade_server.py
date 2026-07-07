#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from git_arcade_parser import GitHistoryParser

PORT = 8000
GIT_DIR = os.path.expanduser("~/git")

class ArcadeHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == "/api/repos":
            repos = []
            if os.path.exists(GIT_DIR):
                for d in os.listdir(GIT_DIR):
                    full_path = os.path.join(GIT_DIR, d)
                    if os.path.isdir(full_path) and os.path.isdir(os.path.join(full_path, ".git")):
                        has_conductor = os.path.isdir(os.path.join(full_path, "conductor"))
                        repos.append({"name": d, "has_conductor": has_conductor})
            
            repos.sort(key=lambda x: (not x["has_conductor"], x["name"].lower()))
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(repos).encode())
            return
            
        elif parsed_path.path == "/api/timeline":
            query = urllib.parse.parse_qs(parsed_path.query)
            repo_name = query.get("repo", [""])[0]
            repo_path = os.path.join(GIT_DIR, repo_name)
            
            if not repo_name or not os.path.exists(repo_path):
                self.send_response(404)
                self.end_headers()
                return
                
            parser = GitHistoryParser(repo_path)
            timeline = parser.generate_json_timeline()
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(timeline).encode())
            return

        elif parsed_path.path == "/api/tracks":
            query = urllib.parse.parse_qs(parsed_path.query)
            repo_name = query.get("repo", [""])[0]
            repo_path = os.path.join(GIT_DIR, repo_name)
            
            if not repo_name or not os.path.exists(repo_path):
                self.send_response(404)
                self.end_headers()
                return
                
            tracks_dir = os.path.join(repo_path, "conductor", "tracks")
            tracks = []
            if os.path.isdir(tracks_dir):
                tracks = [d for d in os.listdir(tracks_dir) if os.path.isdir(os.path.join(tracks_dir, d))]
            tracks.sort()
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(tracks).encode())
            return
            
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    html_dir = os.path.join(os.path.dirname(__file__), "..", "html")
    os.chdir(html_dir)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ArcadeHandler) as httpd:
        print(f"Arcade Server running at http://localhost:{PORT}")
        httpd.serve_forever()
