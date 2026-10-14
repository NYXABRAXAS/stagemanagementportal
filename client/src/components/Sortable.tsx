import type { ReactNode } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/** Vertical drag-and-drop list. Calls onReorder with the new id order. */
export function SortableList({ ids, onReorder, disabled, children }: { ids: string[]; onReorder: (ids: string[]) => void; disabled?: boolean; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }
  if (disabled) return <>{children}</>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** Wraps an item; renders a drag handle via the render prop. */
export function SortableItem({ id, disabled, children }: { id: string; disabled?: boolean; children: (handle: ReactNode, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition, position: 'relative' as const, zIndex: isDragging ? 5 : undefined };
  const handle = disabled ? (
    <span className="grip" style={{ width: 14 }} />
  ) : (
    <span className="grip" {...attributes} {...listeners} title="Drag to reorder" aria-label="Drag to reorder">
      <GripVertical size={14} />
    </span>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle, isDragging)}
    </div>
  );
}
