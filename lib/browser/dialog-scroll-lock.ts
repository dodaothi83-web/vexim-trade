// Shared by nested/transitional dialogs so closing one cannot unlock another.
let locks = 0;
let previous = "";
export function lockDialogScroll(): () => void {
  if (locks++ === 0) { previous = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.body.style.overflow = previous;
  };
}
