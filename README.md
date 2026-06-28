
Conductor at Scale (conductoras) is a framework to observe N git repos at once in a single computer.
Start from ls -al ~/git/**/conductor/ to find the things under contuctor,
then use conductor worktree skill to get the N tasks, and you're good!
Finally, lets use the super duper git-history-animated to animate their execution over time.
Missing piece: patch the conductor branches with antigravity (or other harness( id. to make it unique and be able to rev-connect AGY sessions to implementation.
Why? Cos I want to be able to see, per track, and aggregated per project:
1. how many lines of git diff any branch created (eg +65/-43 lines, like in a diff).
2. How many tokens were spent (eg, 1Mtoken of Gremini3.1 and 250k token of Gemini-3-flash). We measure MegaToken in Macha Lattes because why not (TODO find nice emoji),

The goal of this project is to be able to:
1. identify at gist the status of N git repos at a glance with zero fatigue, possibly with a super fancy responsive WOW frontend app.
2. Animate git repo X in a nice way as per [See my idea on obsidian]. This serves the purpose of a nice animated gif to put n my article2 in my ~/git/life/

