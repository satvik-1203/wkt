interface ProjectPickerProps {
  onAdd: () => void;
}

export function ProjectPicker({ onAdd }: ProjectPickerProps) {
  return (
    <button className="add-project-btn" onClick={onAdd}>
      + Add Project
    </button>
  );
}
