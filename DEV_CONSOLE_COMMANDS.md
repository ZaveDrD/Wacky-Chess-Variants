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


## FX completion update

The previously placeholder FX commands are now implemented with visible overlays/animations:

```text
fx confetti
fx fireworks
fx emoji 🤡
fx rain pawns
fx freeze 2
fx fakecheck
fx fakewin black
fx pause dramatic
fx bonk white
fx jumpscare all
fx toasty
fx laser a1 h8
fx board theme lava
fx board theme ice
fx board theme graveyard
fx board theme scooby
fx board theme nuke
fx board theme gold
fx board theme void
fx scooby mysterymachine
fx scooby traproulette
fx scooby ghosttrap e4
fx scooby smoke e4
fx scooby jinkies e4
fx scooby haunt e4
fx scooby boo e4
```

## Cosmetics completion update

The cosmetic commands are now implemented as persistent local visual changes:

```text
cosmetic piece e4 size big
cosmetic piece e4 size tiny
cosmetic piece e4 spin
cosmetic piece e4 jiggle
cosmetic piece e4 glow red
cosmetic piece e4 hat crown
cosmetic piece e4 mustache
cosmetic piece e4 name Gary
cosmetic piece e4 clown
cosmetic piece e4 ghost
cosmetic piece e4 clear

cosmetic icon white queen 🦆
cosmetic player black duckify
cosmetic player white scoobydoo
cosmetic curse black haunted
cosmetic clear
```

Legacy aliases also work:

```text
bigpiece e4
tinypiece e4
spinpiece e4
jigglepiece e4
glowpiece e4 red
hat e4 crown
mustache e4
renamepiece e4 Gary
duckify black
scoobydoo white
clearcosmetics
```


## Forced lobby FX/cosmetics

You can now force visual effects or cosmetics onto other connected clients. Targets include:

```text
self
room
others
opponent
white
black
spectators
lobby
home
all
[player name]
```

Examples:

```text
fx force lobby jumpscare all
fx force lobby confetti
fx force all board theme void
fx force opponent bonk black
fx force Ben scooby mysterymachine

cosmetic force lobby curse white haunted
cosmetic force lobby player white duckify
cosmetic force all icon white queen 🦆
cosmetic force opponent piece e4 hat crown
cosmetic force lobby clear
```

`lobby` and `home` target clients currently on the home/lobby screen. `all` targets everyone connected except the developer running the command.

## FX particle fix

The particle effects now use explicit per-particle positions instead of unsupported CSS modulo calculations.

Fixed commands:

```text
fx confetti
fx fireworks
fx rain pawns
fx rain queen
fx rain duck
fx force lobby confetti
fx force lobby fireworks
fx force lobby rain pawns
```

Changes:
- `confetti` now fills the whole screen with many pieces.
- `fireworks` now creates multiple bursts across the screen.
- `rain` now repeats the requested item across the whole screen.
- common chess words such as `pawns`, `queen`, `rooks`, `knights`, etc. now map to chess symbols.
