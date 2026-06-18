import whiteKingIcon from "../assets/pieces/white-king.svg";
import whiteQueenIcon from "../assets/pieces/white-queen.svg";
import whiteRookIcon from "../assets/pieces/white-rook.svg";
import whiteBishopIcon from "../assets/pieces/white-bishop.svg";
import whiteKnightIcon from "../assets/pieces/white-knight.svg";
import whitePawnIcon from "../assets/pieces/white-pawn.svg";
import blackKingIcon from "../assets/pieces/black-king.svg";
import blackQueenIcon from "../assets/pieces/black-queen.svg";
import blackRookIcon from "../assets/pieces/black-rook.svg";
import blackBishopIcon from "../assets/pieces/black-bishop.svg";
import blackKnightIcon from "../assets/pieces/black-knight.svg";
import blackPawnIcon from "../assets/pieces/black-pawn.svg";

export const COLORS = {
  lightSquare: "#eeeed2",
  darkSquare: "#769656",
  selected: "#f6f669",
  legalMove: "#baca44",
  captureMove: "#d96c75",
  whitePiece: "#ffffff",
  blackPiece: "#1f2933",
  boardBackground: "#312e2b",
  panel: "#262421",
  panelBorder: "#4b4843",
  text: "#f5f5f5",
  mutedText: "#b8b8b8"
};

export const PIECE_SYMBOLS = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙"
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟"
  }
};

export const PIECE_ICONS = {
  white: {
    king: whiteKingIcon,
    queen: whiteQueenIcon,
    rook: whiteRookIcon,
    bishop: whiteBishopIcon,
    knight: whiteKnightIcon,
    pawn: whitePawnIcon
  },
  black: {
    king: blackKingIcon,
    queen: blackQueenIcon,
    rook: blackRookIcon,
    bishop: blackBishopIcon,
    knight: blackKnightIcon,
    pawn: blackPawnIcon
  }
};
