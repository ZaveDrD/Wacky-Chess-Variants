# Developer Console Commands

Open the hidden developer console with:

```text
Shift → Up → Down → Left → Right → Shift
```

Close it with `Escape`.

Before commands work, type the developer password. The browser bundle does not contain the plaintext password; the server checks a PBKDF2-SHA256 hash.

The editable in-code command registry is:

```text
client/src/game/devCommands.js
```

That file controls command names, aliases, usage strings, and documentation-only summaries.

## Room / joining commands

| Command | Summary |
|---|---|
| `help` | Lists command usages in the console. |
| `clear` | Clears the developer console output. |
| `findopenmatches` | Lists active/open room codes. |
| `listrooms detailed` | Lists active rooms with detailed metadata. |
| `spectatematch [room code \| random]` | Spectates a room. |
| `joincode [room code]` | Joins a room normally; becomes spectator if seats are full. |
| `startmatch [variant_name] [num_bots] [bot_difficulty=medium]` | Starts a new match; `2` bots makes you spectator. |
| `botbattle [variant] [difficulty1] [difficulty2]` | Starts a bot-vs-bot match. |
| `exitmatch` | Leaves the current match and returns to lobby. |
| `roominfo [room code]` | Shows metadata for a room. |
| `copyroom` | Copies current room code. |
| `kickplayer [name]` | Removes a player/spectator from the current room. |
| `lockroom` | Prevents additional spectators from joining. |
| `unlockroom` | Allows spectators again. |
| `renameroom [name]` | Adds a display name to the current room. |
| `broadcast [message]` | Adds a system message to chat. |
| `systemchat [message]` | Adds a system chat line. |

## Player / match commands

| Command | Summary |
|---|---|
| `replacewithbot [name] [difficulty=medium]` | Replaces an active player with a bot; human becomes spectator. |
| `replaceplayer [name]` | You take over that player slot; target becomes spectator. |
| `endmatch [white \| black \| none]` | Ends the current match. |
| `findplayer [name]` | Searches rooms for a player/spectator name. |
| `playercount` | Shows room/player/spectator/bot counts. |
| `spectatoroverride [player=self]` | Allows a participant to move all pieces. |
| `clearoverride [player=self]` | Disables spectator override. |
| `setplayercolour [name] [white\|black\|spectator]` | Moves a participant into a colour slot or spectator role. |
| `setturn [white\|black]` | Forces whose turn it is. |
| `forfeit` | Use the normal in-game button, not a console command. |

## Board editing commands

| Command | Summary |
|---|---|
| `addpiece [location] [piecetype] [colour=turn]` | Adds a piece. |
| `removepiece [location]` | Removes a piece. |
| `teleportpiece [from] [to]` | Moves a piece without recording a move. |
| `moveforce [from] [to]` | Moves a piece without legality validation and records it. |
| `legalmoves [location]` | Lists legal moves for a piece. |
| `checkstatus` | Shows check/legal move status. |
| `validateboard` | Checks for invalid board state. |
| `resetmatch` | Resets current match to starting position. |
| `cloneposition` | Prints a position code. |
| `loadposition [code]` | Loads a position code. |
| `listpieces [white\|black]` | Lists pieces and locations. |

## AI commands

| Command | Summary |
|---|---|
| `aithink [white\|black] [difficulty]` | Shows AI candidate moves without moving. |
| `forceaimove [white\|black] [difficulty]` | Forces a selected side to make an AI move. |
| `setaidifficulty [white\|black] [easy\|medium\|hard]` | Changes/creates bot control for a side. |
| `pausebots` | Pauses AI turns. |
| `resumebots` | Resumes AI turns. |
| `evalposition [white\|black]` | Shows AI static evaluation. |
| `topmoves [white\|black] [n=5]` | Lists top AI candidates and scores. |

## Timer commands

| Command | Summary |
|---|---|
| `settimer [seconds \| mm:ss \| hh:mm:ss] [white\|black=turn]` | Sets a clock. |
| `pausetimer` | Freezes both clocks. |
| `resumetimer` | Resumes clocks. |
| `addtime [white\|black] [time]` | Adds time. |
| `settimecontrol [classical\|rapid\|blitz\|bullet]` | Resets both clocks to a time control. |
| `flag [white\|black]` | Forces a timeout loss. |

## Visual/debug commands

| Command | Summary |
|---|---|
| `setview [xz \| xy \| yz \| iso]` | Changes local view. |
| `setlayer [0-7]` | Changes local layer. |
| `showcoords` | Toggles coordinate labels. |
| `showattacks [white\|black]` | Highlights debug attack origins for a side. |
| `showchecks` | Highlights king squares. |
| `highlight [location]` | Highlights a square. |
| `clearhighlights` | Clears dev highlights. |
| `ghostmove [from] [to]` | Shows a projected move marker. |

## Fun/test commands

| Command | Summary |
|---|---|
| `chaosmove` | Makes a random legal move for the current side. |
| `swapkings` | Swaps king positions. |
| `promoteall [white\|black] [piece]` | Promotes pawns. |
| `army [white\|black] [piece]` | Converts non-king pieces into one type. |
| `mirrorboard` | Mirrors all pieces. |
| `shufflebackrank` | Randomises back-rank non-kings. |
| `spawnarmy [white\|black] [piece] [count]` | Adds random pieces. |
| `nuke [location] [radius]` | Removes non-king pieces around a location. |
| `kingofthehill` | Moves kings to central test positions. |
