import paper1 from "../assets/textures/paper-1.jpg";
import paper2 from "../assets/textures/paper-2.jpg";
import paper3 from "../assets/textures/paper-3.jpg";
import paper4 from "../assets/textures/paper-4.jpg";
import paper5 from "../assets/textures/paper-5.jpg";

export const TEXTURES = [
  { id: "paper1", src: paper1, label: "纸张质感 1" },
  { id: "paper2", src: paper2, label: "纸张质感 2" },
  { id: "paper3", src: paper3, label: "纸张质感 3" },
  { id: "paper4", src: paper4, label: "纸张质感 4" },
  { id: "paper5", src: paper5, label: "纸张质感 5" },
];

export function getTextureSrc(id) {
  return TEXTURES.find((t) => t.id === id)?.src ?? null;
}
