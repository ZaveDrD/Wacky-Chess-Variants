# Developer Console Commands

Open the hidden developer console:

```text
Shift → Up → Down → Left → Right → Shift
```

Unlock with the developer password.

The console has been refactored into broad command groups. Use:

```text
help
help 1
help 2
help chat
help whisper
help fx
```

`help` explains the paged help system. `help 1` to `help 6` list categories. `help [category]` lists subcommands and parameters. Legacy aliases still work, so commands such as `sudo`, `shout`, `kickplayer`, `god`, `spotlight`, and `ping` still resolve to the new grouped form.

## Top-level groups

```text
help
clear
room
player
match
chat
board
piece
view
mark
ai
clock
fx
cosmetic
chaos
predict
scooby
tycoon
nuke
crazyhouse
atomic
hill
```

## Examples

```text
chat sudo black I definitely meant that
chat announce Sudden death starts now
chat whisper white check the queen
chat quote blunder

room start scooby 1 hard
room kick Ben

piece god e4 on
piece god e4 off
piece replace e4 queen black

mark spotlight e4
mark ping d5

fx earthquake
fx board theme lava
fx scooby ghosttrap e4
fx clear

cosmetic piece e4 size big
cosmetic piece e4 hat crown
cosmetic curse black haunted
cosmetic clear

chaos yeet e4
chaos clone e4 e5
chaos mutate d4 queen
chaos pawnstorm white

predict state
predict reveal
predict lock white e2 e4
predict resolve

scooby trap add mine e4 white
scooby trap storm black 5
scooby smoke bomb e4
scooby control zap e4 black

tycoon money set white 50
tycoon wall place e4 white
tycoon bomb party 5

nuke charge max black
nuke oops e4

crazyhouse reserve gift white queen
crazyhouse reserve bomb black

atomic explode e4
atomic chainreaction
```

## Notes

- `[VISUAL]` commands such as `fx` and `cosmetic` are local visual effects unless explicitly stated.
- `[DANGEROUS]` commands such as `chaos`, `tycoon bomb party`, `scooby trap storm`, and `atomic explode` modify actual game state.
- `room kick [name]` now sends the kicked client back to the home screen.
- `piece god [square] on` makes a piece unkillable by normal captures/explosions.
