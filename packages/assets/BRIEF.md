# Brief for asset agents

You draw one pack of game graphics as SVG files for a browser Python teaching environment (students are 12 to 18; they use the graphics in small Pygame Zero style games, e.g. `Actor("name")`).

1. Read `CONVENTIONS.md` in this folder first. It defines folders, `pack.json`, SVG rules and the look. Follow it exactly. A test will check it.
2. Write only into your own pack folder `packages/assets/<pack>/` (create it) and scratch files into the scratchpad `/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/assets-work/<pack>/`. Do not use git. Do not touch other folders.
3. Names must be unique over all packs. Generic words that other packs are likely to use (tree, cloud, coin, star, heart, bush, rock, fish, sun, flower, key, chest, ...) must carry a word that is specific to your pack or object, for example `meadow_tree`, `sea_cloud`. Before you finish, run `ls /home/user/natter/packages/assets/*/pack.json` and check the other packs' names that exist by then.
4. Everything must be original. Do not imitate or evoke an existing game, film or brand character or its distinctive silhouette (no plumber, no mushroom-walking enemies, no yellow circle with a mouth, no famous hedgehog, no familiar bird with a pipe game, etc.).
5. Quality check yourself: build a contact sheet HTML of all your SVGs (on a light and on a dark background, at natural size and at half size), render it with Chromium through Playwright (Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, Playwright is installed in `/opt/node-tools/node_modules`; run your script from `/opt/node-tools` or set `NODE_PATH=/opt/node-tools/node_modules`) and look at the screenshots. Fix what looks wrong. Check that animation frames of one character have the same size and a consistent anchor so that swapping them does not jump.
6. Final report: pack name, number of files, the list of names grouped, anything you were unsure about. Keep it short.
