import unittest
import os
import tempfile
import subprocess
import json
import sys

# Add bin to path to import the script later
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bin')))

try:
    from git_arcade_parser import GitHistoryParser
except ImportError:
    GitHistoryParser = None

class TestGitArcadeParser(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.repo_dir = os.path.join(self.temp_dir, "test_repo")
        os.makedirs(self.repo_dir)
        
        # Initialize a mock git repo
        subprocess.run(["git", "init"], cwd=self.repo_dir, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "TestUser"], cwd=self.repo_dir, check=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=self.repo_dir, check=True)
        
        # Create an initial commit on main
        with open(os.path.join(self.repo_dir, "file.txt"), "w") as f:
            f.write("Line 1\nLine 2\nLine 3\n")
        subprocess.run(["git", "add", "."], cwd=self.repo_dir, check=True)
        subprocess.run(["git", "commit", "-m", "Initial commit on main"], cwd=self.repo_dir, check=True)
        
        # Branch cuj01
        subprocess.run(["git", "checkout", "-b", "cuj01"], cwd=self.repo_dir, check=True, capture_output=True)
        with open(os.path.join(self.repo_dir, "file.txt"), "w") as f:
            f.write("Line 1 Modified\nLine 2\nLine 3\nLine 4 Added\nLine 5 Added\n")
        subprocess.run(["git", "add", "."], cwd=self.repo_dir, check=True)
        subprocess.run(["git", "commit", "-m", "Modified cuj01 file"], cwd=self.repo_dir, check=True)

        # Merge back to main
        subprocess.run(["git", "checkout", "main"], cwd=self.repo_dir, check=True, capture_output=True)
        subprocess.run(["git", "merge", "cuj01", "--no-ff", "-m", "Merge cuj01 to main"], cwd=self.repo_dir, check=True, capture_output=True)

    def tearDown(self):
        # Cleanup
        subprocess.run(["rm", "-rf", self.temp_dir])

    @unittest.skipIf(GitHistoryParser is None, "Parser not implemented yet")
    def test_parse_commit_diff(self):
        parser = GitHistoryParser(self.repo_dir)
        timeline = parser.generate_json_timeline()
        
        self.assertTrue(len(timeline) >= 2, "Should have at least 2 events")
        
        # Check the cuj01 commit (which should have additions and deletions)
        cuj_commits = [c for c in timeline if c.get("branch") == "cuj01"]
        self.assertTrue(len(cuj_commits) >= 1, "Missing cuj01 commit")
        
        commit = cuj_commits[0]
        self.assertEqual(commit["author"], "TestUser")
        self.assertEqual(commit["message"], "Modified cuj01 file")
        self.assertTrue(commit["added"] >= 2, "Should have added lines")
        self.assertTrue(commit["deleted"] >= 1, "Should have deleted lines")

    @unittest.skipIf(GitHistoryParser is None, "Parser not implemented yet")
    def test_timeline_generation_chronology(self):
        parser = GitHistoryParser(self.repo_dir)
        timeline = parser.generate_json_timeline()
        
        timestamps = [c["timestamp"] for c in timeline]
        self.assertEqual(timestamps, sorted(timestamps), "Timeline is not sorted chronologically")

    @unittest.skipIf(GitHistoryParser is None, "Parser not implemented yet")
    def test_conductor_track_extraction(self):
        # Create a commit modifying a file in conductor/tracks/my_track_20260601/
        track_dir = os.path.join(self.repo_dir, "conductor", "tracks", "my_track_20260601")
        os.makedirs(track_dir, exist_ok=True)
        
        with open(os.path.join(track_dir, "spec.md"), "w") as f:
            f.write("Spec details\n")
            
        # Commit with a plus-addressed email
        subprocess.run(["git", "config", "user.email", "test+alias@google.com"], cwd=self.repo_dir, check=True)
        subprocess.run(["git", "add", "."], cwd=self.repo_dir, check=True)
        subprocess.run(["git", "commit", "-m", "Add spec for my track"], cwd=self.repo_dir, check=True)
        
        parser = GitHistoryParser(self.repo_dir)
        timeline = parser.generate_json_timeline()
        
        # Check track and email alias normalization
        track_commits = [c for c in timeline if c.get("track") == "my_track_20260601"]
        self.assertEqual(len(track_commits), 1, "Should have parsed 1 track commit")
        
        commit = track_commits[0]
        self.assertEqual(commit["track_display"], "My Track")
        self.assertEqual(commit["email"], "test@google.com")

if __name__ == "__main__":
    unittest.main()
