import ClassicTemplate from "./ClassicTemplate";
import ModernTemplate from "./ModernTemplate";
import ClassicMirroredTemplate from "./ClassicMirroredTemplate";

export const TEMPLATES = [
  { id: "classic", label: "经典", Component: ClassicTemplate },
  { id: "modern", label: "现代", Component: ModernTemplate },
  { id: "classic-mirrored", label: "副票在右", Component: ClassicMirroredTemplate },
];

export function getTemplateComponent(id) {
  return TEMPLATES.find((t) => t.id === id)?.Component ?? ClassicTemplate;
}
