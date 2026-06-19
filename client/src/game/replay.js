const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

export function createInitialPiecesForReplay() {
  const pieces = [];

  for (let x = 0; x < 8; x += 1) {
    pieces.push({ id: `white_${backRank[x]}_${x}`, type: backRank[x], color: "white", x, y: 0, z: 0, hasMoved: false });
    pieces.push({ id: `white_pawn_${x}`, type: "pawn", color: "white", x, y: 0, z: 1, hasMoved: false });
    pieces.push({ id: `black_${backRank[x]}_${x}`, type: backRank[x], color: "black", x, y: 0, z: 7, hasMoved: false });
    pieces.push({ id: `black_pawn_${x}`, type: "pawn", color: "black", x, y: 0, z: 6, hasMoved: false });
  }

  return pieces;
}

export function buildReviewTimeline(game) {
  if (!game) return [];

  const moves = game.moveHistory || [];
  let pieces = Array.isArray(game.initialPieces) && game.initialPieces.length
    ? clonePieces(game.initialPieces)
    : createInitialPiecesForReplay();
  const timeline = [makeReviewGame(game, pieces, [], 0, null)];

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    pieces = clonePieces(pieces);
    applyRecordedMove(pieces, move);
    timeline.push(makeReviewGame(game, pieces, moves.slice(0, i + 1), i + 1, move));
  }

  if (timeline.length > 0) {
    const final = timeline[timeline.length - 1];
    final.status = game.status;
    final.winner = game.winner;
    final.message = game.message;
    final.check = game.check;
    final.checkmate = game.checkmate;
    final.stalemate = game.stalemate;
  }

  return timeline;
}

function makeReviewGame(sourceGame, pieces, moveHistory, reviewIndex, lastReviewMove) {
  const lastMove = moveHistory[moveHistory.length - 1] || null;
  return {
    ...sourceGame,
    pieces: clonePieces(pieces),
    moveHistory,
    lastMove,
    reviewIndex,
    lastReviewMove,
    status: "review",
    message: reviewIndex === 0 ? "Initial position." : `Review move ${reviewIndex}.`,
    check: null,
    checkmate: false,
    stalemate: false,
    turn: reviewIndex % 2 === 0 ? "white" : "black"
  };
}

function applyRecordedMove(pieces, move) {
  if (move.nukeLaunch) return;
  if (move.nukeExplosion && Array.isArray(move.nukeRemoved)) {
    for (const removed of move.nukeRemoved) pieces = removePieceByIdInPlace(pieces, removed.id);
    return;
  }
  if (move.tycoonExplosion && Array.isArray(move.tycoonRemoved)) {
    for (const removed of move.tycoonRemoved) pieces = removePieceByIdInPlace(pieces, removed.id);
    return;
  }
  if (move.tycoon) {
    if (["pawn", "knight", "bishop", "rook", "queen", "wall"].includes(move.pieceType) && move.to) {
      pieces.push({
        id: move.pieceId,
        type: move.pieceType,
        color: move.pieceType === "wall" ? "wall" : move.pieceColor,
        owner: move.pieceColor,
        x: move.to.x,
        y: move.to.y,
        z: move.to.z,
        hasMoved: true
      });
    }
    if (move.tycoonAction === "shield" && move.pieceId) {
      const target = pieces.find((candidate) => candidate.id === move.pieceId);
      if (target) target.shielded = true;
    }
    return;
  }
  if (move.drop) {
    pieces.push({
      id: move.pieceId,
      type: move.pieceType,
      color: move.pieceColor,
      x: move.to.x,
      y: move.to.y,
      z: move.to.z,
      hasMoved: true,
      dropped: true
    });
    return;
  }

  if (move.shieldBlocked && move.captured?.id) {
    const target = pieces.find((candidate) => candidate.id === move.captured.id);
    if (target) target.shielded = false;
    return;
  }

  if (move.captured?.id) {
    pieces = removePieceByIdInPlace(pieces, move.captured.id);
  }

  const piece = pieces.find((candidate) => candidate.id === move.pieceId);
  if (!piece) return;

  piece.x = move.to.x;
  piece.y = move.to.y;
  piece.z = move.to.z;
  piece.hasMoved = true;

  if (Array.isArray(move.atomicRemoved) && move.atomicRemoved.length) {
    for (const removed of move.atomicRemoved) pieces = removePieceByIdInPlace(pieces, removed.id);
  }

  if (move.promotedTo) {
    piece.type = move.promotedTo;
  }

  if (move.castle) {
    const rookInfo = getCastleRookInfo(move);
    const rook = pieces.find((candidate) => candidate.id === rookInfo.id);
    if (rook) {
      rook.x = rookInfo.to.x;
      rook.y = rookInfo.to.y;
      rook.z = rookInfo.to.z;
      rook.hasMoved = true;
    }
  }
}

function getCastleRookInfo(move) {
  if (move.rookId && move.rookTo) return { id: move.rookId, to: move.rookTo };

  const kingSide = move.to.x > move.from.x;
  const rookX = kingSide ? 7 : 0;
  const rookTargetX = kingSide ? 5 : 3;

  return {
    id: `${move.pieceColor}_rook_${rookX}`,
    to: { x: rookTargetX, y: move.to.y, z: move.to.z }
  };
}

function removePieceByIdInPlace(pieces, id) {
  const index = pieces.findIndex((candidate) => candidate.id === id);
  if (index >= 0) pieces.splice(index, 1);
  return pieces;
}

function clonePieces(pieces) {
  return pieces.map((piece) => ({ ...piece }));
}
