import React from "react";

export function DevFxLayer({ items }) {
  if (!items?.length) return null;
  const confettiCount = 72;
  const rainCount = 84;
  const fireworksBursts = [
    { x: "18%", y: "28%" },
    { x: "50%", y: "22%" },
    { x: "78%", y: "30%" },
    { x: "33%", y: "56%" },
    { x: "67%", y: "58%" }
  ];
  const fireworkParticles = 20;

  return (
    <div className="dev-fx-layer" aria-hidden="true">
      {items.map((item) => {
        if (item.type === "confetti") {
          return (
            <div key={item.id} className="fx-confetti">
              {Array.from({ length: confettiCount }).map((_, index) => <span key={index} style={confettiStyle(index)} />)}
            </div>
          );
        }
        if (item.type === "fireworks") {
          return (
            <div key={item.id} className="fx-fireworks">
              {fireworksBursts.map((burst, burstIndex) => (
                <div key={burstIndex} className="fx-firework-burst" style={{ left: burst.x, top: burst.y, "--burst-delay": `${burstIndex * 0.24}s` }}>
                  {Array.from({ length: fireworkParticles }).map((_, index) => <span key={index} style={fireworkStyle(index, burstIndex)} />)}
                </div>
              ))}
            </div>
          );
        }
        if (item.type === "rain") {
          return (
            <div key={item.id} className="fx-rain-items">
              {Array.from({ length: rainCount }).map((_, index) => <span key={index} style={rainStyle(index)}>{item.icon}</span>)}
            </div>
          );
        }
        if (item.type === "emoji") return <div key={item.id} className="fx-emoji-big">{item.icon}</div>;
        if (item.type === "freeze") return <div key={item.id} className="fx-freeze-pane">❄</div>;
        if (item.type === "warning") return <div key={item.id} className="fx-warning">{item.text}</div>;
        if (item.type === "victory") return <div key={item.id} className="fx-victory">{item.text}</div>;
        if (item.type === "countdown") return <div key={item.id} className="fx-countdown">{item.text}</div>;
        if (item.type === "bonk") return <div key={item.id} className="fx-bonk">BONK{item.target ? ` ${item.target}` : ""}</div>;
        if (item.type === "jumpscare") return <div key={item.id} className="fx-jumpscare">BOO!</div>;
        if (item.type === "toasty") return <div key={item.id} className="fx-toasty">Toasty!</div>;
        if (item.type === "laser") return <div key={item.id} className="fx-laser"><span>{item.from}</span><i /><span>{item.to}</span></div>;
        if (item.type === "mysterymachine") return <div key={item.id} className="fx-mystery-machine">🚐</div>;
        if (item.type === "ghost") return <div key={item.id} className="fx-ghost">👻</div>;
        if (item.type === "scoobyText") return <div key={item.id} className="fx-scooby-text">{item.text}</div>;
        return <div key={item.id} className="fx-generic">{item.text || item.type}</div>;
      })}
    </div>
  );
}

export function confettiStyle(index) {
  return {
    left: `${(index * 37 + 11) % 100}%`,
    "--delay": `${(index % 18) * -0.055}s`,
    "--duration": `${2.7 + (index % 7) * 0.18}s`,
    "--drift": `${((index * 23) % 31) - 15}vw`,
    "--spin": `${360 + (index % 6) * 180}deg`,
    "--hue": `${(index * 47) % 360}`
  };
}

export function rainStyle(index) {
  return {
    left: `${(index * 29 + 7) % 100}%`,
    "--delay": `${(index % 28) * -0.13}s`,
    "--duration": `${3.1 + (index % 9) * 0.19}s`,
    "--drift": `${((index * 19) % 17) - 8}vw`,
    "--rain-size": `${1.1 + (index % 5) * 0.18}rem`,
    "--rain-rotation": `${180 + (index % 8) * 45}deg`
  };
}

export function fireworkStyle(index, burstIndex) {
  const angle = (Math.PI * 2 * index) / 20;
  const distance = 4.8 + ((index + burstIndex) % 5) * 1.05;
  return {
    "--dx": `${Math.cos(angle) * distance}rem`,
    "--dy": `${Math.sin(angle) * distance}rem`,
    "--spark-delay": `${burstIndex * 0.24 + (index % 4) * 0.025}s`,
    "--hue": `${(burstIndex * 73 + index * 29) % 360}`
  };
}

export function normaliseRainIcon(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    pawn: "♟", pawns: "♟", p: "♟",
    knight: "♞", knights: "♞", n: "♞",
    bishop: "♝", bishops: "♝", b: "♝",
    rook: "♜", rooks: "♜", r: "♜",
    queen: "♛", queens: "♛", q: "♛",
    king: "♚", kings: "♚", k: "♚",
    duck: "🦆", ducks: "🦆",
    dog: "🐕", dogs: "🐕",
    skull: "💀", skulls: "💀",
    clown: "🤡", clowns: "🤡",
    fire: "🔥", money: "💸", coins: "🪙", nuke: "☢️",
    confetti: "🎊", heart: "♥"
  };
  return map[key] || value || "♟";
}
