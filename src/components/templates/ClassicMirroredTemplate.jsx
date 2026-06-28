import ClassicTemplate from "./ClassicTemplate";

// Same look as ClassicTemplate, with the stub flipped to the right of the
// main ticket, and the show title/date leading (above the theatre name)
// instead of following it.
export default function ClassicMirroredTemplate(props) {
  return <ClassicTemplate {...props} mirrored showInfoFirst />;
}
