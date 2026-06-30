import cosetteDecoration from "./assets/decorations/cosette.jpg";

export const defaultTicket = {
  template: "classic",
  theatre: {
    name: "SONDHEIM THEATRE",
    address: "Shaftesbury Avenue, London",
    postcode: "W1D 6BA",
  },
  show: {
    title: "Les Misérables",
  },
  date: "2026-06-26",
  time: "19:30",
  seat: {
    level: "GRAND CIRCLE",
    row: "STANDING",
    seat: "6",
  },
  price: {
    amount: "20",
    currency: "GBP",
  },
  rating: 4,
  review: "只要二十块的大悲站票我高低得体验下！唱得真好啊大热天的看得我一直在起鸡皮疙瘩...",
  decoration: {
    image: cosetteDecoration,
    original: cosetteDecoration,
    halftone: false,
    grayscale: true,
    opacity: 0.7,
    positions: {
      classic: { x: 84, y: 40, scale: 2 },
      modern: { x: 84, y: 40, scale: 2 },
      "classic-mirrored": { x: 67, y: 49, scale: 2 },
    },
  },
  showDivider: true,
  dividerColor: "black",
  dividerNotches: false,
  mainLines: false,
  texture: "paper5",
  colors: {
    mainBg: "#ffffff",
    mainTextColor: "#1a1a1a",
    mainBgImage: null,
    mainBgImageOriginal: null,
    mainBgImageOpacity: 1,
    mainBgImageHalftone: false,
    mainBgImageGrayscale: false,
    subBg: "#425385",
    subBgImage: null,
    subBgImageColors: null,
    subBgUseGradient: false,
    subTextColor: "#ffffff",
  },
};
