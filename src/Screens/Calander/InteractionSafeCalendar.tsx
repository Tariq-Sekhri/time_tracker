import {memo, type ComponentPropsWithRef, type RefObject} from "react";
import FullCalendar from "@fullcalendar/react";

// FullCalendar compares the receiving context by identity when finishing a move.
// Updating its options mid-drag can replace that context, so an accepted move
// never reaches eventDrop. Keep the current props until dragEnd has completed.
export default memo(function InteractionSafeCalendar({interactionLock: _lock, ...props}:
    ComponentPropsWithRef<typeof FullCalendar> & {interactionLock: RefObject<boolean>}) {
    return <FullCalendar {...props} />;
}, (_previous, next) => next.interactionLock.current);
